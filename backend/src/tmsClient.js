import mongoose from "mongoose";

/**
 * Direct MongoDB bridge to TMS (Ticket Management System).
 * Instead of calling TMS HTTP APIs with service-account credentials,
 * feedback tickets are inserted directly into the TMS `tickets` collection.
 */

let tmsConnectionPromise = null;
const FEEDBACK_SECTION_NAME = "Feedback Tickets";
const FEEDBACK_DEPARTMENT_CODE = "FBK";
const FEEDBACK_CATEGORY_CODE = "FBK";

const log = (...args) => {
  // eslint-disable-next-line no-console
  console.log("[tms]", ...args);
};

const errLog = (...args) => {
  // eslint-disable-next-line no-console
  console.error("[tms]", ...args);
};

export class TmsError extends Error {
  constructor(message, { status = 0, body = null, cause = null } = {}) {
    super(message);
    this.name = "TmsError";
    this.status = status;
    this.body = body;
    if (cause) this.cause = cause;
  }
}

export function isTmsConfigured() {
  return Boolean(getTmsMongoUri());
}

function getTmsMongoUri() {
  return String(
    process.env.TMS_MONGODB_URI ||
      process.env.TMS_DB_URI ||
      "mongodb://127.0.0.1:27017/tms_hospital"
  ).trim();
}

async function getTmsDb() {
  if (!tmsConnectionPromise) {
    const uri = getTmsMongoUri();
    if (!uri) {
      throw new TmsError("TMS MongoDB URI is not configured", { status: 503 });
    }
    tmsConnectionPromise = mongoose
      .createConnection(uri, {
        serverSelectionTimeoutMS: 5000,
      })
      .asPromise()
      .then((conn) => {
        log("connected to TMS MongoDB");
        return conn;
      })
      .catch((error) => {
        tmsConnectionPromise = null;
        throw new TmsError(`Could not connect to TMS MongoDB: ${error?.message || error}`, {
          status: 502,
          cause: error,
        });
      });
  }
  return tmsConnectionPromise;
}

function toObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

function normalizeCodeToken(value, fallback = "GEN") {
  const token = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 12);
  return token || fallback;
}

function shortStableSuffix(input) {
  const str = String(input || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 4) || "X1";
}

async function ensureFeedbackSection({ departments, categories }) {
  let department = await departments.findOne({
    $or: [{ code: FEEDBACK_DEPARTMENT_CODE }, { name: FEEDBACK_SECTION_NAME }],
  });
  if (!department) {
    const now = new Date();
    const insert = await departments.insertOne({
      name: FEEDBACK_SECTION_NAME,
      code: FEEDBACK_DEPARTMENT_CODE,
      description: "Tickets created from Feedback System",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    department = await departments.findOne({ _id: insert.insertedId });
  } else if (department.isActive === false) {
    await departments.updateOne(
      { _id: department._id },
      { $set: { isActive: true, updatedAt: new Date() } }
    );
    department = await departments.findOne({ _id: department._id });
  }

  let category = await categories.findOne({
    $or: [{ code: FEEDBACK_CATEGORY_CODE }, { name: FEEDBACK_SECTION_NAME }],
  });
  if (!category) {
    const now = new Date();
    const insert = await categories.insertOne({
      name: FEEDBACK_SECTION_NAME,
      code: FEEDBACK_CATEGORY_CODE,
      departmentId: department._id,
      description: "Category for feedback-system generated tickets",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    category = await categories.findOne({ _id: insert.insertedId });
  } else if (category.isActive === false || String(category.departmentId || "") !== String(department._id)) {
    await categories.updateOne(
      { _id: category._id },
      { $set: { isActive: true, departmentId: department._id, updatedAt: new Date() } }
    );
    category = await categories.findOne({ _id: category._id });
  }

  return { department, category };
}

async function ensureDepartmentSubcategory({ subcategories, categoryId, feedbackDepartment }) {
  const departmentName = String(feedbackDepartment || "General Feedback").trim() || "General Feedback";
  let subcategory = await subcategories.findOne({
    categoryId,
    name: departmentName,
  });
  if (!subcategory) {
    const base = `FB_${normalizeCodeToken(departmentName, "GENERAL")}`;
    let code = base;
    const conflict = await subcategories.findOne({ code });
    if (conflict) {
      code = `${base}_${shortStableSuffix(departmentName)}`.slice(0, 20);
    }
    const now = new Date();
    const insert = await subcategories.insertOne({
      name: departmentName,
      code,
      description: "Auto-created from feedback AI department classification",
      isActive: true,
      categoryId,
      createdAt: now,
      updatedAt: now,
    });
    subcategory = await subcategories.findOne({ _id: insert.insertedId });
  } else if (subcategory.isActive === false) {
    await subcategories.updateOne(
      { _id: subcategory._id },
      { $set: { isActive: true, updatedAt: new Date() } }
    );
    subcategory = await subcategories.findOne({ _id: subcategory._id });
  }
  return subcategory;
}

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickHandlingDepartment(tmsDepartments, feedbackDepartmentName) {
  const list = Array.isArray(tmsDepartments) ? tmsDepartments : [];
  const desired = normalizeLookup(feedbackDepartmentName);
  if (!desired) return null;

  const exact = list.find((d) => normalizeLookup(d?.name) === desired);
  if (exact) return exact;

  const fuzzy = list.find((d) => {
    const name = normalizeLookup(d?.name);
    return name && (name.includes(desired) || desired.includes(name));
  });
  return fuzzy || null;
}

function mapPriority(feedback) {
  const urgency = String(feedback?.aiUrgency || "").toLowerCase();
  if (urgency === "high") return "CRITICAL";
  if (urgency === "medium") return "HIGH";
  if (urgency === "low") return "MEDIUM";

  const rating = Number(feedback?.rating);
  if (rating <= 1) return "CRITICAL";
  if (rating <= 2) return "HIGH";
  if (rating <= 3) return "MEDIUM";
  return "LOW";
}

function summarizeForTms(feedback) {
  const patient = feedback?.patientName || "Patient";
  const dept = feedback?.department || "Unknown department";
  const rating = feedback?.rating;
  const comments = String(feedback?.comments || "").trim();
  const aiSummary = String(feedback?.aiSummary || "").trim();
  const aiSentiment = feedback?.aiSentiment ? ` | AI sentiment: ${feedback.aiSentiment}` : "";
  const aiUrgency = feedback?.aiUrgency ? ` | urgency: ${feedback.aiUrgency}` : "";

  const titleBase = comments || aiSummary || `Negative feedback from ${patient} for ${dept}`;
  const title = `[Patient Feedback] ${titleBase}`.replace(/\s+/g, " ").slice(0, 120);

  const lines = [
    `Patient: ${patient}`,
    `Department (as captured by feedback): ${dept}`,
    rating != null ? `Rating: ${rating}/5` : null,
    aiSentiment.trim() || null,
    aiUrgency.trim() || null,
    "",
    "Verbatim comments:",
    comments || "(no text comments)",
    aiSummary ? `\nAI summary:\n${aiSummary}` : null,
  ].filter((line) => line !== null);

  return { title, prompt: lines.join("\n") };
}

/**
 * Creates a ticket in TMS for a feedback record. Returns the TMS ticket
 * envelope (id, ticketNumber, status, etc.) on success.
 */
/**
 * Writes voice metadata on an existing TMS row (multipart voice is saved after initial sync).
 */
export async function patchTmsTicketFeedbackVoice(ticketIdStr, { feedbackVoiceRecordingRelPath, feedbackSourceId } = {}) {
  const idStr = String(ticketIdStr || "").trim();
  if (!idStr) {
    throw new TmsError("TMS ticket id is required", { status: 400 });
  }
  const db = await getTmsDb();
  const oid = toObjectId(idStr);
  if (!oid) {
    throw new TmsError("Invalid TMS ticket id", { status: 400 });
  }
  const set = { updatedAt: new Date() };
  let patchBody = false;
  if (feedbackVoiceRecordingRelPath != null && String(feedbackVoiceRecordingRelPath).trim()) {
    set.feedbackVoiceRecordingRelPath = String(feedbackVoiceRecordingRelPath).replace(/^\/+/, "");
    patchBody = true;
  }
  if (feedbackSourceId != null && String(feedbackSourceId).trim()) {
    set.feedbackSourceId = String(feedbackSourceId).trim();
    patchBody = true;
  }
  if (!patchBody) return;

  const result = await db.collection("tickets").updateOne({ _id: oid }, { $set: set });
  if (!result.matchedCount) {
    throw new TmsError("Ticket not found in TMS", { status: 404 });
  }
  log("patched TMS ticket feedback voice meta", {
    tmsTicketId: idStr,
    hasVoicePath: Boolean(set.feedbackVoiceRecordingRelPath),
  });
}

export async function createTicketForFeedback(feedback) {
  if (!isTmsConfigured()) {
    throw new TmsError("TMS integration is not configured", { status: 503 });
  }
  const db = await getTmsDb();
  const departments = db.collection("departments");
  const categories = db.collection("categories");
  const subcategories = db.collection("subcategories");
  const users = db.collection("users");
  const tickets = db.collection("tickets");

  const requester =
    (await users.findOne({ role: "REQUESTER", isActive: true }, { sort: { createdAt: 1 } })) ||
    (await users.findOne({ isActive: true }, { sort: { createdAt: 1 } }));
  if (!requester?._id) {
    throw new TmsError("No active user found in TMS users collection", { status: 503 });
  }

  // Dedicated feedback category/subcategory in TMS (no TMS-side AI classification required).
  const { department, category } = await ensureFeedbackSection({ departments, categories });
  const subcategory = await ensureDepartmentSubcategory({
    subcategories,
    categoryId: category._id,
    feedbackDepartment: feedback?.department,
  });
  const activeDepartments = await departments.find({ isActive: true }).toArray();
  const aiMatchedDepartment = pickHandlingDepartment(activeDepartments, feedback?.department);
  const handlingDepartment = aiMatchedDepartment || department;

  const year = new Date().getUTCFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);
  const runningNumber = (await tickets.countDocuments({ createdAt: { $gte: start, $lt: end } })) + 1;
  const categoryCode = String(category.code || "GEN").toUpperCase();
  const ticketNumber = `TKT-${categoryCode}-${year}-${String(runningNumber).padStart(4, "0")}`;

  const { title, prompt } = summarizeForTms(feedback);
  const now = new Date();
  const feedbackVoiceRel = feedback?.voiceRecordingRelPath
    ? String(feedback.voiceRecordingRelPath).replace(/^\/+/, "")
    : null;

  const doc = {
    ticketNumber,
    title: String(title || "").slice(0, 120),
    description: String(prompt || ""),
    priority: mapPriority(feedback),
    status: "OPEN",
    isOverdue: false,
    // Handling department is selected from TMS departments using Feedback AI output.
    departmentId: handlingDepartment._id,
    // Feedback tickets come from patients, not an internal requester department.
    requesterDepartmentId: null,
    categoryId: category._id,
    subcategoryId: subcategory._id,
    locationId: null,
    locationText: null,
    requesterId: requester._id,
    assignedToId: null,
    telecomNumber: null,
    firstResponseDueAt: null,
    resolutionDueAt: null,
    escalationDueAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    requesterResolutionConfirmedAt: null,
    closedAt: null,
    escalatedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...(feedback?._id ? { feedbackSourceId: String(feedback._id) } : {}),
    ...(feedbackVoiceRel ? { feedbackVoiceRecordingRelPath: feedbackVoiceRel } : {}),
  };

  const result = await tickets.insertOne(doc);
  const data = {
    ...doc,
    _id: result.insertedId,
    id: String(result.insertedId),
  };
  log("ticket created in TMS DB", {
    feedbackId: String(feedback?._id || ""),
    tmsTicketId: data.id,
    ticketNumber: data.ticketNumber,
  });
  return data;
}

export async function getTmsHealth() {
  try {
    const db = await getTmsDb();
    await db.db.command({ ping: 1 });
    return { ok: true, status: 200, body: { ok: true, mode: "mongodb", uri: getTmsMongoUri() } };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, message: error?.message || "TMS MongoDB is unreachable" },
    };
  }
}

export async function listTmsDepartments() {
  const db = await getTmsDb();
  const data = await db.collection("departments").find({}).sort({ name: 1 }).toArray();
  return { data, meta: { count: data.length } };
}

export async function getTmsTicket(id) {
  const db = await getTmsDb();
  const objectId = toObjectId(id);
  const query = objectId ? { _id: objectId } : { ticketNumber: String(id || "").trim() };
  const data = await db.collection("tickets").findOne(query);
  if (!data) throw new TmsError("Ticket not found in TMS", { status: 404 });
  return data;
}

export async function listTmsTickets(query = {}) {
  const db = await getTmsDb();
  const where = {};
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.priority) where.priority = String(query.priority).trim().toUpperCase();
  if (query.search) {
    const term = String(query.search).trim();
    where.$or = [
      { ticketNumber: { $regex: term, $options: "i" } },
      { title: { $regex: term, $options: "i" } },
    ];
  }

  const limitRaw = Number(query.limit);
  const pageRaw = Number(query.page);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    db.collection("tickets").find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    db.collection("tickets").countDocuments(where),
  ]);
  const meta = { page, limit, total, count: data.length };
  return { data, meta };
}

/** Surfaces a useful link for UIs to open the ticket directly in the TMS web app. */
export function buildTmsTicketUrl(ticketIdOrNumber) {
  const base = (process.env.TMS_CLIENT_URL || "").trim().replace(/\/+$/, "");
  if (!base || !ticketIdOrNumber) return null;
  return `${base}/tickets/${encodeURIComponent(ticketIdOrNumber)}`;
}

export function tmsErrorToHttp(error) {
  const status = error instanceof TmsError && error.status >= 400 && error.status < 600 ? error.status : 502;
  const message = error?.message || "TMS request failed";
  return { status, body: { message, tms: error?.body ?? null } };
}

export function logTmsFailure(context, error) {
  errLog(`${context} failed`, {
    message: error?.message || String(error),
    status: error?.status || null,
    body: error?.body || null,
  });
}
