import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs/promises";
import {
  analyzePatientFeedback,
  resolveServiceFromAi,
  resolveServiceHintWithOpenRouter,
  inferRatingFromVoiceTranscript,
} from "./openRouterAnalysis.js";
import { extractSarvamTranscript, stringifySarvamError } from "./sarvamSpeech.js";
import {
  buildComplaintSignature,
  evaluateTicketForFeedback,
  ensureIssuesList,
  newSubmissionGroupId,
  resolveServiceHeuristic,
} from "./feedbackIssueProcessing.js";
import { sanitizeOptionalLabel } from "./fieldSanitize.js";
import { filterAiTopicsForTranscript } from "./aiTopicsFilter.js";
import {
  isTmsConfigured,
  isTmsCatalogEnabled,
  isTmsOutboundEnabled,
  createTicketForFeedback,
  patchTmsTicketFeedbackVoice,
  getTmsHealth,
  listTmsDepartments,
  getTmsTicket,
  listTmsTickets,
  buildTmsTicketUrl,
  tmsErrorToHttp,
  logTmsFailure,
} from "./tmsClient.js";
import { lookupPatientRecords, isEmrPatientLookupEnabled } from "./emrPatientLookup.js";
import {
  Branding,
  Department,
  Feedback,
  RoutingService,
  User,
  mongoose,
} from "./models.js";
import {
  attachBotAnswerPlaybackUrls,
  buildBotCommentsFromAnswers,
  ensureBotConversationConfig,
  registerBotConversationRoutes,
  saveBotAnswerRecording,
} from "./botConversation.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

app.use(cors());
app.use(express.json());

const speechUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const feedbackSubmitUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
}).fields([
  { name: "voiceRecording", maxCount: 1 },
  { name: "answerAudio", maxCount: 12 },
]);

const botAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

/** TMS loads `<audio src="https://feedback.../uploads/...">` — browsers may send Range; OPTIONS needs explicit CORS. */
function uploadsCorsAndOptions(req, res, next) {
  const list = String(process.env.FEEDBACK_CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (list.length && origin && list.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
}

app.use("/uploads", uploadsCorsAndOptions, express.static(UPLOADS_ROOT));

function attachVoicePlaybackUrl(doc) {
  if (!doc) return doc;
  let plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (plain.voiceRecordingRelPath) {
    plain.voiceRecordingUrl = `/uploads/${String(plain.voiceRecordingRelPath).replace(/^\/+/, "")}`;
  }
  plain = attachBotAnswerPlaybackUrls(plain);
  return plain;
}

const DEFAULT_VOICE_RECORDING_MAX_SECONDS = 120;
const DEFAULT_BOT_THINK_SECONDS = 3;

function normalizeVoiceRecordingMaxSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOICE_RECORDING_MAX_SECONDS;
  return Math.min(600, Math.max(15, Math.round(n)));
}

function normalizeBotThinkSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BOT_THINK_SECONDS;
  return Math.min(30, Math.max(1, Math.round(n)));
}

function serializeBrandingSettings(doc) {
  if (!doc) {
    return {
      primaryColor: "#2A6FDB",
      accentColor: "#2FBF71",
      pageBackgroundColor: "#F5F7FA",
      logoDataUrl: null,
      voiceRecordingMaxSeconds: DEFAULT_VOICE_RECORDING_MAX_SECONDS,
      botThinkSeconds: DEFAULT_BOT_THINK_SECONDS,
    };
  }
  return {
    primaryColor: doc.primaryColor,
    accentColor: doc.accentColor || "#2FBF71",
    pageBackgroundColor: doc.pageBackgroundColor,
    logoDataUrl: doc.logoDataUrl ?? null,
    voiceRecordingMaxSeconds: normalizeVoiceRecordingMaxSeconds(doc.voiceRecordingMaxSeconds),
    botThinkSeconds: normalizeBotThinkSeconds(doc.botThinkSeconds),
  };
}

function mergeRowWithGroupDonor(plain, donorPlain) {
  if (!donorPlain) return plain;
  const donorComments = String(donorPlain.comments || "").trim();
  const rowComments = String(plain.comments || "").trim();
  const useDonorTranscript =
    donorComments.length > 0 &&
    (rowComments.length < 40 ||
      (plain.isSplitChild && donorComments.length > rowComments.length + 20));

  return {
    ...plain,
    submissionMode: plain.submissionMode || donorPlain.submissionMode || "bot",
    botConversationAnswers: donorPlain.botConversationAnswers?.length
      ? donorPlain.botConversationAnswers
      : plain.botConversationAnswers,
    voiceRecordingRelPath: plain.voiceRecordingRelPath || donorPlain.voiceRecordingRelPath,
    voiceRecordingUrl: plain.voiceRecordingUrl || donorPlain.voiceRecordingUrl,
    botVoiceSourceFeedbackId: donorPlain.botConversationAnswers?.length
      ? String(donorPlain._id)
      : plain.botVoiceSourceFeedbackId,
    ...(useDonorTranscript ? { comments: donorComments } : {}),
  };
}

/** Split tickets: attach parent voice recording, bot Q&A, and full STT from same submission group. */
async function enrichFeedbackWithGroupDonor(row) {
  const plain = attachVoicePlaybackUrl(row);
  if (!plain.submissionGroupId) {
    return plain;
  }

  const needsVoice = !plain.voiceRecordingRelPath;
  const needsBot =
    !Array.isArray(plain.botConversationAnswers) || plain.botConversationAnswers.length === 0;
  const needsTranscript =
    plain.isSplitChild &&
    String(plain.comments || "").length < 80;

  if (!needsVoice && !needsBot && !needsTranscript) {
    return plain;
  }

  const donor = await Feedback.findOne({
    submissionGroupId: plain.submissionGroupId,
    isSplitChild: { $ne: true },
  })
    .sort({ _id: 1 })
    .lean();

  if (!donor) {
    return plain;
  }

  return mergeRowWithGroupDonor(plain, attachVoicePlaybackUrl(donor));
}

async function enrichFeedbackListWithGroupDonor(rows) {
  const plainRows = rows.map((row) => attachVoicePlaybackUrl(row));
  const groupIds = new Set();
  for (const row of plainRows) {
    if (row.submissionGroupId) {
      groupIds.add(row.submissionGroupId);
    }
  }
  if (groupIds.size === 0) {
    return plainRows;
  }

  const donors = await Feedback.find({
    submissionGroupId: { $in: [...groupIds] },
    isSplitChild: { $ne: true },
  })
    .sort({ _id: 1 })
    .lean();

  const donorByGroup = new Map();
  for (const donor of donors) {
    const key = donor.submissionGroupId;
    if (!key || donorByGroup.has(key)) continue;
    donorByGroup.set(key, attachVoicePlaybackUrl(donor));
  }

  return plainRows.map((row) => {
    if (!row.submissionGroupId) {
      return row;
    }
    return mergeRowWithGroupDonor(row, donorByGroup.get(row.submissionGroupId));
  });
}

async function saveFeedbackVoiceRecording(feedbackId, fileBuffer, mimeHint = "") {
  const ext = String(mimeHint).includes("mp4") ? "m4a" : "webm";
  const dir = path.join(UPLOADS_ROOT, "feedback-voice");
  await fs.mkdir(dir, { recursive: true });
  const rel = path.join("feedback-voice", `${feedbackId}.${ext}`).replace(/\\/g, "/");
  await fs.writeFile(path.join(UPLOADS_ROOT, rel), fileBuffer);
  return rel;
}

function newTicketId() {
  return `TKT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * Pushes a feedback record to TMS as a real ticket. If TMS isn't configured or
 * the call fails, we keep the local `ticketId` so the UI keeps working and we
 * stash the error on the feedback row for diagnostics. Returns the patched doc.
 */
async function syncFeedbackToTms(feedback, { reason } = {}) {
  if (!isTmsOutboundEnabled()) {
    // eslint-disable-next-line no-console
    console.log("[feedback] tms sync skipped", {
      feedbackId: String(feedback?._id || ""),
      reason: isTmsConfigured()
        ? "TMS_OUTBOUND_ENABLED is not set"
        : "TMS_API_BASE_URL not set",
    });
    return feedback;
  }
  try {
    // eslint-disable-next-line no-console
    console.log("[feedback] tms sync calling TMS…", {
      feedbackId: String(feedback._id),
      trigger: reason || "unspecified",
      localTicketId: feedback.ticketId || null,
      rating: feedback.rating,
    });
    const tmsTicket = await createTicketForFeedback(feedback);
    const tmsId = tmsTicket?.id || tmsTicket?._id || null;
    const tmsNumber = tmsTicket?.ticketNumber || null;
    const set = {
      tmsTicketId: tmsId ? String(tmsId) : null,
      tmsTicketNumber: tmsNumber || null,
      tmsTicketUrl: buildTmsTicketUrl(tmsNumber || tmsId),
      tmsSyncedAt: new Date(),
      tmsSyncError: null,
    };
    if (tmsNumber) {
      // Replace the placeholder TKT-XXXX with the real TMS ticket number for clarity.
      set.ticketId = tmsNumber;
    }
    const updated = await Feedback.findByIdAndUpdate(feedback._id, { $set: set }, { new: true }).lean();
    // eslint-disable-next-line no-console
    console.log("[feedback] tms sync ok", {
      feedbackId: String(feedback._id),
      reason: reason || "unspecified",
      tmsTicketId: set.tmsTicketId,
      tmsTicketNumber: set.tmsTicketNumber,
    });
    return updated || feedback;
  } catch (error) {
    logTmsFailure("createTicketForFeedback", error);
    // eslint-disable-next-line no-console
    console.error("[feedback] tms sync FAILED", {
      feedbackId: String(feedback?._id || ""),
      message: error?.message || String(error),
      httpStatus: error?.status ?? null,
      tmsResponseBody: error?.body ?? null,
    });
    const set = {
      tmsSyncError: String(error?.message || "TMS sync failed").slice(0, 500),
      tmsSyncedAt: new Date(),
    };
    const updated = await Feedback.findByIdAndUpdate(feedback._id, { $set: set }, { new: true }).lean();
    return updated || feedback;
  }
}

async function ensureDefaults() {
  const deptCount = await Department.countDocuments();
  if (deptCount === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[feedback] No departments in DB. Run: npm run seed-mock -- --yes"
    );
  }

  const brandingCount = await Branding.countDocuments();
  if (brandingCount === 0) {
    await Branding.create({
      key: "global",
      primaryColor: "#2A6FDB",
      accentColor: "#2FBF71",
      pageBackgroundColor: "#F5F7FA",
      logoDataUrl: null,
      voiceRecordingMaxSeconds: DEFAULT_VOICE_RECORDING_MAX_SECONDS,
      botThinkSeconds: DEFAULT_BOT_THINK_SECONDS,
    });
  }

  await ensureBotConversationConfig();
}

/**
 * Loads TMS departments for routing/AI hints. Never throws — returns [] if TMS is
 * unreachable (common on production when the Feedback server cannot call tms.mapims.edu.in).
 */
async function loadTmsDepartmentDocsOrEmpty() {
  if (!isTmsCatalogEnabled()) {
    // eslint-disable-next-line no-console
    console.warn(
      "[feedback] TMS catalog disabled — use local routing services only (set TMS_CATALOG_ENABLED=true to pull from TMS)"
    );
    return [];
  }
  try {
    const result = await listTmsDepartments();
    const tmsRows = Array.isArray(result?.data) ? result.data : [];
    const mapped = tmsRows
      .filter((row) => row && row.name)
      .map((row) => ({
        _id: String(row._id || ""),
        name: String(row.name || "").trim(),
        description: String(row.description || "").trim(),
      }))
      .filter((row) => row.name.length > 0);
    if (mapped.length > 0) {
      // eslint-disable-next-line no-console
      console.log("[feedback] TMS departments loaded", {
        count: mapped.length,
        sampleNames: mapped.slice(0, 5).map((d) => d.name),
      });
      return mapped;
    }
    // eslint-disable-next-line no-console
    console.warn("[feedback] TMS departments list was empty — continuing without department matching");
    return [];
  } catch (error) {
    logTmsFailure("listTmsDepartments", error);
    // eslint-disable-next-line no-console
    console.warn(
      "[feedback] Could not load departments from TMS (check server outbound HTTPS to TMS_API_BASE_URL, TLS, FEEDBACK_INGEST_TOKEN). Continuing without department list.",
      error?.message || error
    );
    return [];
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/speech-to-text", speechUpload.single("audio"), async (req, res) => {
  try {
    const sarvamKey = process.env.SARVAM_API_KEY;
    if (!sarvamKey) {
      return res.status(503).json({ message: "Speech transcription is not configured" });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: "Missing audio file (field name: audio)" });
    }

    const model =
      (typeof req.body.model === "string" && req.body.model.trim()) ||
      process.env.SARVAM_STT_MODEL ||
      "saaras:v3";
    const mode =
      (typeof req.body.mode === "string" && req.body.mode.trim()) ||
      process.env.SARVAM_STT_MODE ||
      "codemix";
    const language_code =
      (typeof req.body.language_code === "string" && req.body.language_code.trim()) || "unknown";

    const filename = req.file.originalname || "recording.webm";
    const blob = new Blob([req.file.buffer], {
      type: req.file.mimetype || "application/octet-stream",
    });

    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("model", model);
    if (model === "saaras:v3") {
      formData.append("mode", mode);
    }
    formData.append("language_code", language_code);

    const sarvamRes = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": sarvamKey },
      body: formData,
    });

    const rawText = await sarvamRes.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText };
    }

    if (!sarvamRes.ok) {
      const msg = stringifySarvamError(data);
      return res.status(sarvamRes.status >= 400 && sarvamRes.status < 600 ? sarvamRes.status : 502).json({
        message: msg,
      });
    }

    const transcriptText = extractSarvamTranscript(data);

    return res.json({
      transcript: transcriptText,
      language_code: data.language_code ?? null,
      request_id: data.request_id ?? null,
    });
  } catch (error) {
    return res.status(502).json({ message: "Could not reach speech transcription service" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "username and password required" });
    }
    const user = await User.findOne({ username: String(username).trim().toLowerCase() }).lean();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    return res.json({
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed" });
  }
});

function serviceNameKey(name) {
  return String(name || "").trim().toLowerCase();
}

async function loadLocalRoutingServicesFromDb() {
  const rows = await RoutingService.find().sort({ name: 1 }).lean();
  return rows.map((row) => ({
    _id: String(row._id),
    name: row.name,
    description: row.description || "",
  }));
}

/** TMS + local MongoDB services for AI routing (TMS name wins on duplicate). */
async function loadServiceCatalogForAi() {
  const tms = await loadTmsDepartmentDocsOrEmpty();
  const local = await loadLocalRoutingServicesFromDb();
  const seen = new Set(tms.map((row) => serviceNameKey(row.name)));
  const extra = local.filter((row) => {
    const key = serviceNameKey(row.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...tms, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}

async function listServiceCatalogForUi() {
  const tms = await loadTmsDepartmentDocsOrEmpty();
  const local = await loadLocalRoutingServicesFromDb();
  const tmsKeys = new Set(tms.map((row) => serviceNameKey(row.name)));
  const items = [
    ...tms.map((row) => ({
      _id: row._id,
      name: row.name,
      description: row.description || "",
      source: "tms",
      readOnly: true,
    })),
    ...local
      .filter((row) => !tmsKeys.has(serviceNameKey(row.name)))
      .map((row) => ({
        _id: row._id,
        name: row.name,
        description: row.description || "",
        source: "local",
        readOnly: false,
      })),
  ];
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function tmsServiceNameKeys() {
  const tms = await loadTmsDepartmentDocsOrEmpty();
  return new Set(tms.map((row) => serviceNameKey(row.name)));
}

function normalizeServicesPayload(services) {
  if (!Array.isArray(services)) return [];
  return services
    .filter((s) => s && String(s.name || "").trim())
    .map((s) => ({
      name: String(s.name).trim(),
      description: String(s.description || "").trim(),
    }));
}

/** Hospital departments in MongoDB (staff assignment, EMR analytics labels). */
async function listHospitalDepartmentsFromDb() {
  const rows = await Department.find().sort({ name: 1 }).lean();
  return rows.map((row) => ({
    _id: String(row._id),
    name: row.name,
    description: row.description || "",
    services: Array.isArray(row.services) ? row.services : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

app.get("/api/departments", async (_req, res) => {
  try {
    return res.json(await listHospitalDepartmentsFromDb());
  } catch (error) {
    return res.status(500).json({ message: "Failed to list departments" });
  }
});

app.get("/api/hospital-departments", async (_req, res) => {
  try {
    return res.json(await listHospitalDepartmentsFromDb());
  } catch (error) {
    return res.status(500).json({ message: "Failed to list departments" });
  }
});

/** Routing catalog for AI / ticket routing (TMS + locally managed services). */
app.get("/api/services", async (_req, res) => {
  try {
    return res.json(await listServiceCatalogForUi());
  } catch (error) {
    return res.status(500).json({ message: "Failed to list services" });
  }
});

app.post("/api/services", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const trimmedName = String(name).trim();
    const tmsKeys = await tmsServiceNameKeys();
    if (tmsKeys.has(serviceNameKey(trimmedName))) {
      return res.status(409).json({
        message: "A service with this name already exists in TMS — edit it in TMS instead.",
      });
    }
    const doc = await RoutingService.create({
      name: trimmedName,
      description: String(description || "").trim(),
    });
    return res.status(201).json({
      _id: String(doc._id),
      name: doc.name,
      description: doc.description || "",
      source: "local",
      readOnly: false,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Service name already exists" });
    }
    return res.status(500).json({ message: "Failed to create service" });
  }
});

app.patch("/api/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Service not found" });
    }
    const existing = await RoutingService.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Service not found or managed in TMS" });
    }
    const { name, description } = req.body;
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ message: "name cannot be empty" });
      }
      const tmsKeys = await tmsServiceNameKeys();
      if (tmsKeys.has(serviceNameKey(trimmedName)) && serviceNameKey(trimmedName) !== serviceNameKey(existing.name)) {
        return res.status(409).json({
          message: "A service with this name already exists in TMS.",
        });
      }
      existing.name = trimmedName;
    }
    if (description !== undefined) {
      existing.description = String(description || "").trim();
    }
    await existing.save();
    return res.json({
      _id: String(existing._id),
      name: existing.name,
      description: existing.description || "",
      source: "local",
      readOnly: false,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Service name already exists" });
    }
    return res.status(500).json({ message: "Failed to update service" });
  }
});

app.delete("/api/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Service not found" });
    }
    const deleted = await RoutingService.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Service not found or managed in TMS" });
    }
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete service" });
  }
});

app.post("/api/departments", async (req, res) => {
  try {
    const { name, description, services } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const doc = await Department.create({
      name: String(name).trim(),
      description: String(description || "").trim(),
      services: normalizeServicesPayload(services),
    });
    return res.status(201).json(doc);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Department name already exists" });
    }
    return res.status(500).json({ message: "Failed to create department" });
  }
});

app.post("/api/hospital-departments", async (req, res) => {
  try {
    const { name, description, services } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const doc = await Department.create({
      name: String(name).trim(),
      description: String(description || "").trim(),
      services: normalizeServicesPayload(services),
    });
    return res.status(201).json(doc);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Department name already exists" });
    }
    return res.status(500).json({ message: "Failed to create department" });
  }
});

app.delete("/api/departments/:id", async (req, res) => {
  try {
    const deleted = await Department.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete department" });
  }
});

app.delete("/api/hospital-departments/:id", async (req, res) => {
  try {
    const deleted = await Department.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete department" });
  }
});

app.patch("/api/departments/:id", async (req, res) => {
  try {
    const { name, description, services } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const update = {
      name: String(name).trim(),
      description: String(description || "").trim(),
    };
    if (Array.isArray(services)) {
      update.services = normalizeServicesPayload(services);
    }
    const updated = await Department.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Department name already exists" });
    }
    return res.status(500).json({ message: "Failed to update department" });
  }
});

app.patch("/api/hospital-departments/:id", async (req, res) => {
  try {
    const { name, description, services } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const update = {
      name: String(name).trim(),
      description: String(description || "").trim(),
    };
    if (Array.isArray(services)) {
      update.services = normalizeServicesPayload(services);
    }
    const updated = await Department.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Department name already exists" });
    }
    return res.status(500).json({ message: "Failed to update department" });
  }
});

app.get("/api/users", async (_req, res) => {
  try {
    const list = await User.find()
      .select("-passwordHash")
      .populate("departmentId", "name")
      .sort({ username: 1 })
      .lean();
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ message: "Failed to list users" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { username, password, role, departmentId } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: "username, password, and role are required" });
    }
    if (!["admin", "staff"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);
    const deptOk =
      departmentId && mongoose.Types.ObjectId.isValid(String(departmentId));
    const doc = await User.create({
      username: String(username).trim().toLowerCase(),
      passwordHash,
      role,
      departmentId: deptOk ? String(departmentId) : null,
    });
    const out = await User.findById(doc._id).select("-passwordHash").populate("departmentId", "name").lean();
    return res.status(201).json(out);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Username already exists" });
    }
    return res.status(500).json({ message: "Failed to create user" });
  }
});

app.patch("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role, departmentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (!username || !role) {
      return res.status(400).json({ message: "username and role are required" });
    }
    if (!["admin", "staff"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const update = {
      username: String(username).trim().toLowerCase(),
      role,
      departmentId:
        departmentId && mongoose.Types.ObjectId.isValid(String(departmentId))
          ? String(departmentId)
          : null,
    };

    if (password && String(password).trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      update.passwordHash = await bcrypt.hash(String(password), salt);
    }

    const updated = await User.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .select("-passwordHash")
      .populate("departmentId", "name")
      .lean();

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Username already exists" });
    }
    return res.status(500).json({ message: "Failed to update user" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const deleted = await User.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

/** Ensures every AI-negative feedback has a ticket id (open in Ticket Management) and reopens Resolved rows. */
app.post("/api/seed/open-negative-tickets", async (_req, res) => {
  try {
    const rows = await Feedback.find({ aiSentiment: "negative" }).lean();
    let updated = 0;
    let tmsSynced = 0;
    let tmsFailed = 0;
    for (const row of rows) {
      const set = {};
      let opened = false;
      if (!row.ticketId) {
        set.ticketId = newTicketId();
        set.status = "New";
        opened = true;
      } else if (row.status === "Resolved") {
        set.status = "New";
      }
      if (Object.keys(set).length > 0) {
        await Feedback.updateOne({ _id: row._id }, { $set: set });
        updated += 1;
      }
      if (opened && isTmsOutboundEnabled() && !row.tmsTicketId) {
        const fresh = await Feedback.findById(row._id).lean();
        const after = await syncFeedbackToTms(fresh, { reason: "seed_open_negative" });
        if (after?.tmsTicketId) tmsSynced += 1;
        else tmsFailed += 1;
      }
    }
    const withTickets = await Feedback.countDocuments({
      aiSentiment: "negative",
      ticketId: { $nin: [null, ""] },
    });
    return res.json({
      updated,
      negativeWithTicket: withTickets,
      tmsSynced,
      tmsFailed,
      tmsConfigured: isTmsConfigured(),
      tmsOutboundEnabled: isTmsOutboundEnabled(),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to open negative tickets" });
  }
});

app.post("/api/patient/lookup", async (req, res) => {
  if (!isEmrPatientLookupEnabled()) {
    return res.status(503).json({
      message: "Patient lookup is disabled on this server.",
      disabled: true,
    });
  }
  try {
    const regNo = typeof req.body?.regNo === "string" ? req.body.regNo.trim() : "";
    const patientName = typeof req.body?.patientName === "string" ? req.body.patientName.trim() : "";
    const frmDate = typeof req.body?.frmDate === "string" ? req.body.frmDate.trim() : "";
    const toDate = typeof req.body?.toDate === "string" ? req.body.toDate.trim() : "";
    if (!regNo && !patientName) {
      return res.status(400).json({ message: "Provide regNo (UHID) or patientName." });
    }
    if (regNo.length > 80 || patientName.length > 200) {
      return res.status(400).json({ message: "Lookup input is too long." });
    }
    const result = await lookupPatientRecords({ regNo, patientName, frmDate, toDate });
    return res.json(result);
  } catch (error) {
    if (error?.code === "VALIDATION") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "AbortError") {
      return res.status(504).json({ message: "Hospital records lookup timed out. Try again." });
    }
    // eslint-disable-next-line no-console
    console.error("[patient lookup] failed", { message: error?.message || String(error) });
    return res.status(502).json({
      message: error?.message || "Could not reach hospital records for lookup.",
    });
  }
});

app.post("/api/feedback/infer-voice-rating", async (req, res) => {
  try {
    const transcript = req.body?.transcript;
    if (typeof transcript !== "string" || !transcript.trim()) {
      return res.status(400).json({ message: "transcript is required" });
    }
    const out = await inferRatingFromVoiceTranscript(transcript);
    return res.json({
      rating: out.rating,
      sentiment: out.sentiment,
    });
  } catch (error) {
    return res.status(500).json({ message: "Could not infer rating" });
  }
});

async function applyIssueTicketsAndTms({
  feedbackId,
  patientName,
  rating,
  issueRows,
  emrDepartment,
  fullComments,
  existingTicketId,
  existingTicketRule,
  existingTicketIsFresh,
}) {
  const submissionGroupId = newSubmissionGroupId();
  const normalizedFullComments = String(fullComments || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const issues = ensureIssuesList(issueRows, {
    department: emrDepartment,
    recommendedService: "",
    issueSummary: String(fullComments || "").trim().slice(0, 500),
    suggestedAction: "Review feedback and assign appropriate service owner.",
  });

  let primaryTicketId = existingTicketId;
  let primaryTicketRule = existingTicketRule;
  let primaryTicketIsFresh = existingTicketIsFresh;

  const issuesWithTickets = [];
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const sig = buildComplaintSignature(
      issue.department || emrDepartment,
      issue.recommendedService,
      issue.issueSummary || normalizedFullComments
    );
    let ticketId = null;
    let ticketRule = "none";
    let ticketIsFresh = false;

    if (i === 0 && primaryTicketId) {
      ticketId = primaryTicketId;
      ticketRule = primaryTicketRule;
      ticketIsFresh = primaryTicketIsFresh;
    } else {
      const evalResult = await evaluateTicketForFeedback(Feedback, {
        patientName,
        rating,
        complaintSignature: sig,
      });
      ticketId = evalResult.ticketId;
      ticketRule = evalResult.ticketRule;
      ticketIsFresh = evalResult.ticketIsFresh;
    }

    issuesWithTickets.push({
      ...issue,
      ticketId: ticketId || null,
    });

    if (i === 0) {
      primaryTicketId = ticketId;
      primaryTicketRule = ticketRule;
      primaryTicketIsFresh = ticketIsFresh;
    }
  }

  return {
    submissionGroupId,
    issues: issuesWithTickets,
    primaryTicketId,
    primaryTicketRule,
    primaryTicketIsFresh,
  };
}

registerBotConversationRoutes(app, { uploadsRoot: UPLOADS_ROOT, botAudioUpload });

app.post("/api/feedback", feedbackSubmitUpload, async (req, res) => {
  try {
    const patientName = req.body.patientName;
    let comments = req.body.comments;
    const source = req.body.source;
    let rating = Number(req.body.rating);
    const rawSubmissionMode = String(req.body.submissionMode || "").toLowerCase().trim();
    const voiceFile = req.files?.voiceRecording?.[0];
    const answerAudioFiles = Array.isArray(req.files?.answerAudio)
      ? req.files.answerAudio
      : [];
    let submissionMode = ["standard", "voice", "bot"].includes(rawSubmissionMode)
      ? rawSubmissionMode
      : voiceFile?.buffer?.length
        ? "voice"
        : answerAudioFiles.length
          ? "bot"
          : "standard";

    let botConversationAnswers = [];
    if (submissionMode === "bot") {
      try {
        const parsed = JSON.parse(req.body.conversationAnswers || "[]");
        if (Array.isArray(parsed)) {
          botConversationAnswers = parsed.map((row, idx) => ({
            questionOrder: Number.isFinite(Number(row.questionOrder))
              ? Number(row.questionOrder)
              : idx,
            questionText: String(row.questionText || "").trim().slice(0, 500),
            transcript: String(row.transcript || "").trim().slice(0, 4000),
            audioRelPath: null,
          }));
        }
      } catch {
        botConversationAnswers = [];
      }
      if (botConversationAnswers.length) {
        comments = buildBotCommentsFromAnswers(botConversationAnswers);
        if (process.env.OPENROUTER_API_KEY) {
          botConversationAnswers = await Promise.all(
            botConversationAnswers.map(async (row) => {
              try {
                const inferred = await inferRatingFromVoiceTranscript(row.transcript);
                return { ...row, answerSentiment: inferred.sentiment };
              } catch {
                return row;
              }
            })
          );
        }
      }
      if (!rating || rating < 1 || rating > 5) {
        try {
          const inferred = await inferRatingFromVoiceTranscript(comments || "");
          if (inferred?.rating >= 1 && inferred.rating <= 5) {
            rating = inferred.rating;
          }
        } catch {
          /* keep rating as-is */
        }
      }
      if (!rating || rating < 1 || rating > 5) {
        rating = 3;
      }
    }
    const rawEncounter = String(req.body.patientEncounterType || "").toLowerCase().trim();
    const patientEncounterType = ["op", "ip"].includes(rawEncounter) ? rawEncounter : "";
    const patientRegNo = String(req.body.patientRegNo || "").trim().slice(0, 80);
    const ward = String(req.body.ward || "").trim().slice(0, 120);
    const ipNo = String(req.body.ipNo || "").trim().slice(0, 80);
    const visitOrAdmissionDate = String(req.body.visitOrAdmissionDate || "").trim().slice(0, 80);

    if (!patientName || !rating) {
      return res
        .status(400)
        .json({ message: "patientName and rating are required" });
    }

    const serviceCatalog = await loadServiceCatalogForAi();
    const numericRating = Number(rating);

    /** Visit department: UHID/EMR first; name-only flow uses saved hospital department from form */
    const visitDepartment = patientRegNo
      ? sanitizeOptionalLabel(req.body.lookupDepartment || req.body.department)
      : sanitizeOptionalLabel(req.body.department);
    /** Optional service hint; AI picks recommended service from routing catalog */
    const serviceHint = sanitizeOptionalLabel(req.body.service);

    const svcHeuristic = resolveServiceHeuristic(serviceHint, serviceCatalog);
    let normalizedService = svcHeuristic.name;
    let serviceHintFromAi = false;
    if (
      svcHeuristic.method === "unmatched" &&
      process.env.OPENROUTER_API_KEY &&
      serviceCatalog.length > 0 &&
      serviceHint
    ) {
      try {
        const fromAi = await resolveServiceHintWithOpenRouter(serviceHint, serviceCatalog);
        if (fromAi) {
          normalizedService = fromAi;
          serviceHintFromAi = true;
        }
      } catch (svcAiErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] service hint OpenRouter failed", {
          message: svcAiErr?.message || String(svcAiErr),
        });
      }
    }

    const complaintSignature = buildComplaintSignature(
      visitDepartment,
      normalizedService,
      comments || ""
    );

    const initialTicket = await evaluateTicketForFeedback(Feedback, {
      patientName,
      rating: numericRating,
      complaintSignature,
    });
    let ticketId = initialTicket.ticketId;
    let ticketRule = initialTicket.ticketRule;
    let ticketIsFresh = initialTicket.ticketIsFresh;

    const feedback = await Feedback.create({
      patientName,
      patientRegNo,
      patientEncounterType,
      ward,
      ipNo,
      visitOrAdmissionDate,
      department: visitDepartment,
      lookupDepartment: patientRegNo ? visitDepartment : "",
      service: normalizedService,
      rating: numericRating,
      comments: comments || "",
      source: ["patient", "staff", "ai"].includes(source) ? source : "patient",
      complaintSignature,
      ticketId,
      submissionMode,
      botConversationAnswers,
    });

    let outDoc = feedback.toObject();
    let splitChildDocs = [];

    // eslint-disable-next-line no-console
    console.log("[feedback] created", {
      id: String(feedback._id),
      rating: numericRating,
      source: outDoc.source,
      ticketId: ticketId || null,
      complaintTicketRaised: Boolean(ticketId),
      ticketRule,
      visitDepartment: visitDepartment || "(none)",
      serviceHeuristic: svcHeuristic.method,
      serviceResolvedByAiHint: serviceHintFromAi,
    });

    if (process.env.OPENROUTER_API_KEY) {
      try {
        // eslint-disable-next-line no-console
        console.log("[feedback] AI analysis starting", {
          feedbackId: String(feedback._id),
        });
        const ai = await analyzePatientFeedback(
          {
            patientName,
            patientDepartment: visitDepartment,
            department: visitDepartment,
            service: normalizedService,
            rating: numericRating,
            comments: comments || "",
          },
          {
            feedbackId: String(feedback._id),
            serviceChoices: serviceCatalog.map((d) => ({
              name: d.name,
              description: d.description || "",
            })),
          }
        );
        if (ai) {
          const issueBundle = await applyIssueTicketsAndTms({
            feedbackId: String(feedback._id),
            patientName,
            rating: numericRating,
            issueRows: ai.issues,
            emrDepartment: visitDepartment,
            fullComments: comments || "",
            existingTicketId: ticketId,
            existingTicketRule: ticketRule,
            existingTicketIsFresh: ticketIsFresh,
          });

          ticketId = issueBundle.primaryTicketId;
          ticketRule = issueBundle.primaryTicketRule;
          ticketIsFresh = issueBundle.primaryTicketIsFresh;

          const primaryIssue = issueBundle.issues[0];
          const pickCatalogService = (name) => {
            const n = sanitizeOptionalLabel(name);
            if (!n || !serviceCatalog.length) return "";
            return resolveServiceFromAi(n, serviceCatalog) ? n : "";
          };
          const recommendedService =
            pickCatalogService(primaryIssue?.recommendedService) ||
            pickCatalogService(ai.recommendedService) ||
            pickCatalogService(normalizedService);
          const primarySentiment =
            primaryIssue?.sentiment && ["positive", "neutral", "negative"].includes(primaryIssue.sentiment)
              ? primaryIssue.sentiment
              : ai.sentiment;

          const setFields = {
            aiSentiment: primarySentiment,
            aiUrgency: ai.urgency,
            aiTopics: filterAiTopicsForTranscript(
              ai.topics.length ? ai.topics : [],
              comments || ""
            ),
            aiSummary: ai.summary,
            aiAnalyzedAt: new Date(),
            service: recommendedService || normalizedService,
            department: visitDepartment || sanitizeOptionalLabel(primaryIssue?.department),
            lookupDepartment: patientRegNo ? visitDepartment : feedback.lookupDepartment || "",
            suggestedAction: primaryIssue?.suggestedAction || "",
            feedbackIssues: issueBundle.issues,
            submissionGroupId: issueBundle.submissionGroupId,
            complaintSignature: buildComplaintSignature(
              primaryIssue?.department || visitDepartment,
              recommendedService,
              comments || ""
            ),
            ticketId: ticketId || null,
          };

          if (primarySentiment === "negative" && !ticketId) {
            setFields.ticketId = newTicketId();
            setFields.status = "New";
            ticketId = setFields.ticketId;
            ticketIsFresh = true;
            ticketRule = ticketRule === "none" ? "ai_negative_sentiment" : ticketRule;
            if (setFields.feedbackIssues?.[0]) {
              setFields.feedbackIssues[0].ticketId = setFields.ticketId;
            }
          }

          const updated = await Feedback.findByIdAndUpdate(
            feedback._id,
            { $set: setFields },
            { new: true }
          ).lean();
          if (updated) {
            outDoc = updated;
          }

          if (issueBundle.issues.length > 1) {
            const base = {
              patientName,
              patientRegNo,
              patientEncounterType,
              ward,
              ipNo,
              visitOrAdmissionDate,
              lookupDepartment: patientRegNo ? visitDepartment : "",
              rating: numericRating,
              source: outDoc.source,
              submissionMode,
              botConversationAnswers: outDoc.botConversationAnswers || [],
              submissionGroupId: issueBundle.submissionGroupId,
              isSplitChild: true,
              aiUrgency: ai.urgency,
              aiTopics: filterAiTopicsForTranscript(ai.topics, comments || ""),
              aiSummary: ai.summary,
              aiAnalyzedAt: new Date(),
              feedbackIssues: issueBundle.issues,
            };

            for (let i = 1; i < issueBundle.issues.length; i++) {
              const issue = issueBundle.issues[i];
              const issueSentiment =
                issue?.sentiment && ["positive", "neutral", "negative"].includes(issue.sentiment)
                  ? issue.sentiment
                  : ai.sentiment;
              const childSig = buildComplaintSignature(
                issue.department || visitDepartment,
                issue.recommendedService,
                issue.issueSummary
              );
              let childTicketId = issue.ticketId;
              let childTicketIsFresh = false;
              if (!childTicketId) {
                const childEval = await evaluateTicketForFeedback(Feedback, {
                  patientName,
                  rating: numericRating,
                  complaintSignature: childSig,
                });
                childTicketId = childEval.ticketId;
                childTicketIsFresh = childEval.ticketIsFresh;
              } else {
                childTicketIsFresh = true;
              }

              if (issueSentiment === "negative" && !childTicketId) {
                childTicketId = newTicketId();
                childTicketIsFresh = true;
              }

              const childTopics = filterAiTopicsForTranscript(ai.topics, comments || "");
              const child = await Feedback.create({
                ...base,
                aiSentiment: issueSentiment,
                department: issue.department || visitDepartment,
                service: issue.recommendedService || recommendedService,
                comments: String(comments || "").trim(),
                aiSummary: issue.issueSummary,
                aiTopics: childTopics,
                suggestedAction: issue.suggestedAction,
                complaintSignature: childSig,
                ticketId: childTicketId,
              });
              let childDoc = child.toObject();
              if (childTicketId && childTicketIsFresh && isTmsOutboundEnabled()) {
                childDoc = await syncFeedbackToTms(childDoc, {
                  reason: `split_issue_${i + 1}`,
                });
              }
              splitChildDocs.push(childDoc);
            }
          }

          // eslint-disable-next-line no-console
          console.log("[feedback] AI fields saved to DB", {
            feedbackId: String(feedback._id),
            aiSentiment: ai.sentiment,
            issueCount: issueBundle.issues.length,
            splitChildren: splitChildDocs.length,
            ticketOpenedForNegative: Boolean(setFields.ticketId),
          });
        }
      } catch (aiErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] AI analysis failed", {
          feedbackId: String(feedback._id),
          message: aiErr?.message || String(aiErr),
        });
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "[feedback] AI analysis skipped (set OPENROUTER_API_KEY in .env to enable)"
      );
    }

    const tmsReady = isTmsOutboundEnabled();
    const willSyncTms = Boolean(
      outDoc.ticketId && ticketIsFresh && !outDoc.tmsTicketId && tmsReady
    );
    if (!tmsReady) {
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push skipped", {
        feedbackId: String(feedback._id),
        why: isTmsConfigured()
          ? "TMS_OUTBOUND_ENABLED not set"
          : "TMS_API_BASE_URL not set",
        ticketId: outDoc.ticketId || null,
        ticketIsFresh,
        ticketRule,
        rating: numericRating,
      });
    } else if (!outDoc.ticketId) {
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push skipped", {
        feedbackId: String(feedback._id),
        why: "no_feedback_ticket_id",
        detail:
          "TMS only runs when a feedback ticket is opened (rating 1, or rating 2 with multi-patient rule, or AI negative sentiment). Rating 3–5 with neutral/positive AI usually does not open a ticket.",
        rating: numericRating,
        ticketRule,
        aiSentiment: outDoc.aiSentiment || null,
      });
    } else if (!ticketIsFresh) {
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push skipped", {
        feedbackId: String(feedback._id),
        why: "ticket_not_fresh_reuse_or_no_new_sync",
        ticketId: outDoc.ticketId,
        ticketRule,
      });
    } else if (outDoc.tmsTicketId) {
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push skipped", {
        feedbackId: String(feedback._id),
        why: "already_has_tmsTicketId",
        tmsTicketId: outDoc.tmsTicketId,
      });
    } else if (willSyncTms) {
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push starting", {
        feedbackId: String(feedback._id),
        ticketId: outDoc.ticketId,
        ticketRule,
      });
    }

    if (outDoc.ticketId && ticketIsFresh && !outDoc.tmsTicketId && isTmsOutboundEnabled()) {
      outDoc = await syncFeedbackToTms(outDoc, { reason: ticketRule });
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push finished", {
        feedbackId: String(feedback._id),
        tmsTicketId: outDoc.tmsTicketId || null,
        tmsTicketNumber: outDoc.tmsTicketNumber || null,
        tmsSyncError: outDoc.tmsSyncError || null,
      });
    }

    if (submissionMode === "bot" && answerAudioFiles.length && botConversationAnswers.length) {
      try {
        const savedAnswers = [...botConversationAnswers];
        for (let i = 0; i < Math.min(answerAudioFiles.length, savedAnswers.length); i++) {
          const file = answerAudioFiles[i];
          if (!file?.buffer?.length) continue;
          const order = savedAnswers[i].questionOrder;
          const rel = await saveBotAnswerRecording(
            UPLOADS_ROOT,
            feedback._id,
            order,
            file.buffer,
            file.mimetype || ""
          );
          savedAnswers[i] = { ...savedAnswers[i], audioRelPath: rel };
        }
        const lastWithAudio = [...savedAnswers].reverse().find((a) => a.audioRelPath);
        const primaryRel = lastWithAudio?.audioRelPath || savedAnswers[0]?.audioRelPath;
        await Feedback.updateOne(
          { _id: feedback._id },
          {
            $set: {
              botConversationAnswers: savedAnswers,
              ...(primaryRel ? { voiceRecordingRelPath: primaryRel } : {}),
            },
          }
        );
        outDoc = {
          ...outDoc,
          botConversationAnswers: savedAnswers,
          ...(primaryRel ? { voiceRecordingRelPath: primaryRel } : {}),
        };
      } catch (botAudioErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] failed to persist bot answer recordings", {
          feedbackId: String(feedback._id),
          message: botAudioErr?.message || String(botAudioErr),
        });
      }
    }

    if (voiceFile?.buffer?.length) {
      try {
        const rel = await saveFeedbackVoiceRecording(
          feedback._id,
          voiceFile.buffer,
          voiceFile.mimetype || ""
        );
        await Feedback.updateOne({ _id: feedback._id }, { $set: { voiceRecordingRelPath: rel } });
        if (outDoc.submissionGroupId) {
          await Feedback.updateMany(
            { submissionGroupId: outDoc.submissionGroupId, isSplitChild: true },
            { $set: { voiceRecordingRelPath: rel } }
          );
        }
        outDoc = { ...outDoc, voiceRecordingRelPath: rel };
        const tmsId = outDoc.tmsTicketId;
        if (tmsId && isTmsOutboundEnabled()) {
          try {
            await patchTmsTicketFeedbackVoice(String(tmsId), {
              feedbackVoiceRecordingRelPath: rel,
              feedbackSourceId: String(feedback._id),
            });
          } catch (patchErr) {
            logTmsFailure("patchTmsTicketFeedbackVoice", patchErr);
            // eslint-disable-next-line no-console
            console.error("[feedback] voice meta PATCH to TMS failed", {
              feedbackId: String(feedback._id),
              tmsTicketId: String(tmsId),
              message: patchErr?.message || String(patchErr),
              httpStatus: patchErr?.status ?? null,
            });
          }
        }
      } catch (voiceErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] failed to persist voice recording", {
          feedbackId: String(feedback._id),
          message: voiceErr?.message || String(voiceErr),
        });
      }
    }

    const payload = attachVoicePlaybackUrl(outDoc);
    const tmsConfigured = isTmsConfigured();
    const tmsOutboundEnabled = isTmsOutboundEnabled();
    let tmsSyncHint = null;
    if (outDoc.ticketId && !tmsOutboundEnabled) {
      tmsSyncHint = isTmsConfigured()
        ? "Local ticket only — TMS outbound sync is disabled (TMS_OUTBOUND_ENABLED is not set)."
        : "Local ticket only — TMS is not configured on this server.";
    } else if (outDoc.ticketId && tmsOutboundEnabled && !outDoc.tmsTicketId && outDoc.tmsSyncError) {
      tmsSyncHint = `TMS sync failed: ${String(outDoc.tmsSyncError).slice(0, 300)}`;
    } else if (outDoc.ticketId && tmsOutboundEnabled && !outDoc.tmsTicketId) {
      tmsSyncHint =
        "Feedback ticket was opened locally but no TMS row was created (check server logs for [feedback] tms push skipped / FAILED).";
    }

    return res.status(201).json({
      ...payload,
      ticketRaised: Boolean(outDoc.ticketId),
      tmsConfigured,
      tmsOutboundEnabled,
      tmsSyncHint,
      splitTickets: splitChildDocs.map((row) => ({
        _id: row._id,
        ticketId: row.ticketId,
        department: row.department,
        service: row.service,
        suggestedAction: row.suggestedAction,
      })),
      feedbackIssues: outDoc.feedbackIssues || [],
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create feedback" });
  }
});

app.get("/api/feedback", async (_req, res) => {
  try {
    // Sort by insertion time from ObjectId to avoid skew from synthetic createdAt values.
    const feedback = await Feedback.find().sort({ _id: -1 }).lean();
    return res.json(await enrichFeedbackListWithGroupDonor(feedback));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch feedback" });
  }
});

app.get("/api/feedback/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { ticketId: id };
    const row = await Feedback.findOne(query).lean();
    if (!row) {
      return res.status(404).json({ message: "Feedback not found" });
    }
    return res.json(await enrichFeedbackWithGroupDonor(row));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch feedback" });
  }
});

/** EMR/UHID department for analytics — prefer frozen lookup value. */
function analyticsDepartmentFromFeedback(item, issue) {
  return sanitizeOptionalLabel(
    item.lookupDepartment || issue?.department || item.department
  );
}

function analyticsSlicesFromFeedback(item) {
  const sentiment = item.aiSentiment;
  if (!["positive", "neutral", "negative"].includes(sentiment)) return [];

  const lookupDept = analyticsDepartmentFromFeedback(item);
  const issueRows =
    Array.isArray(item.feedbackIssues) && item.feedbackIssues.length > 0
      ? item.feedbackIssues
      : [{ department: lookupDept, recommendedService: item.service }];

  return issueRows.map((issue) => ({
    department: analyticsDepartmentFromFeedback(item, issue),
    service: sanitizeOptionalLabel(issue.recommendedService || item.service),
    sentiment,
  }));
}

function bumpCount(counter, key) {
  const k = sanitizeOptionalLabel(key);
  if (!k) return;
  counter[k] = (counter[k] || 0) + 1;
}

function counterToSortedList(counter, keyName) {
  return Object.entries(counter)
    .map(([name, count]) => ({ [keyName]: name, count }))
    .sort((a, b) => b.count - a.count);
}

app.get("/api/analytics", async (_req, res) => {
  try {
    const rows = await Feedback.find().lean();

    const totals = {
      all: rows.length,
      positive: rows.filter((item) => item.aiSentiment === "positive").length,
      neutral: rows.filter((item) => item.aiSentiment === "neutral").length,
      negative: rows.filter((item) => item.aiSentiment === "negative").length,
      aiTickets: rows.filter((item) => item.source === "ai").length,
      averageRating: rows.length
        ? Number(
            (rows.reduce((sum, item) => sum + item.rating, 0) / rows.length).toFixed(1)
          )
        : 0,
    };

    const statusCounter = {
      New: 0,
      "In Progress": 0,
      Resolved: 0,
    };
    const positiveByDepartment = {};
    const negativeByDepartment = {};
    const positiveByService = {};
    const negativeByService = {};
    const submissionsByDepartment = {};
    const dailyCounter = {};

    for (const item of rows) {
      const st = ["New", "In Progress", "Resolved"].includes(item.status)
        ? item.status
        : "New";
      statusCounter[st] = (statusCounter[st] || 0) + 1;

      const lookupDept = analyticsDepartmentFromFeedback(item);
      if (lookupDept) {
        submissionsByDepartment[lookupDept] = (submissionsByDepartment[lookupDept] || 0) + 1;
      }

      for (const slice of analyticsSlicesFromFeedback(item)) {
        if (slice.sentiment === "positive") {
          bumpCount(positiveByDepartment, slice.department);
          bumpCount(positiveByService, slice.service);
        } else if (slice.sentiment === "negative") {
          bumpCount(negativeByDepartment, slice.department);
          bumpCount(negativeByService, slice.service);
        }
      }

      const day = new Date(item.createdAt).toISOString().slice(0, 10);
      dailyCounter[day] = (dailyCounter[day] || 0) + 1;
    }

    const byStatus = Object.entries(statusCounter).map(([status, count]) => ({
      status,
      count,
    }));

    const submissionsByDay = Object.entries(dailyCounter)
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14);

    return res.json({
      totals,
      byStatus,
      negativeByDepartment: counterToSortedList(negativeByDepartment, "department"),
      positiveByDepartment: counterToSortedList(positiveByDepartment, "department"),
      submissionsByDepartment: counterToSortedList(submissionsByDepartment, "department"),
      negativeByService: counterToSortedList(negativeByService, "service"),
      positiveByService: counterToSortedList(positiveByService, "service"),
      submissionsByDay,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to build analytics" });
  }
});

app.patch("/api/feedback/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["New", "In Progress", "Resolved"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const updated = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    return res.json(attachVoicePlaybackUrl(updated));
  } catch (error) {
    return res.status(500).json({ message: "Failed to update feedback status" });
  }
});

app.delete("/api/feedback/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Feedback.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ message: "Feedback not found" });
    }
    return res.json({ success: true, id });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete feedback" });
  }
});

app.get("/api/branding", async (_req, res) => {
  try {
    let branding = await Branding.findOne({ key: "global" }).lean();
    if (!branding) {
      branding = await Branding.create({
        key: "global",
        primaryColor: "#2A6FDB",
        accentColor: "#2FBF71",
        pageBackgroundColor: "#F5F7FA",
        logoDataUrl: null,
        voiceRecordingMaxSeconds: DEFAULT_VOICE_RECORDING_MAX_SECONDS,
        botThinkSeconds: DEFAULT_BOT_THINK_SECONDS,
      });
      return res.json(serializeBrandingSettings(branding));
    }
    return res.json(serializeBrandingSettings(branding));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch branding" });
  }
});

app.put("/api/branding", async (req, res) => {
  try {
    const {
      primaryColor,
      accentColor,
      pageBackgroundColor,
      logoDataUrl,
      voiceRecordingMaxSeconds,
      botThinkSeconds,
    } = req.body;
    if (!primaryColor || !pageBackgroundColor) {
      return res
        .status(400)
        .json({ message: "primaryColor and pageBackgroundColor are required" });
    }
    const updated = await Branding.findOneAndUpdate(
      { key: "global" },
      {
        key: "global",
        primaryColor: String(primaryColor).trim(),
        accentColor: String(accentColor || "#2FBF71").trim(),
        pageBackgroundColor: String(pageBackgroundColor).trim(),
        logoDataUrl: typeof logoDataUrl === "string" ? logoDataUrl : null,
        voiceRecordingMaxSeconds: normalizeVoiceRecordingMaxSeconds(voiceRecordingMaxSeconds),
        botThinkSeconds: normalizeBotThinkSeconds(botThinkSeconds),
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    return res.json(serializeBrandingSettings(updated));
  } catch (error) {
    return res.status(500).json({ message: "Failed to save branding" });
  }
});

app.delete("/api/branding", async (_req, res) => {
  try {
    const reset = await Branding.findOneAndUpdate(
      { key: "global" },
      {
        key: "global",
        primaryColor: "#2A6FDB",
        accentColor: "#2FBF71",
        pageBackgroundColor: "#F5F7FA",
        logoDataUrl: null,
        voiceRecordingMaxSeconds: DEFAULT_VOICE_RECORDING_MAX_SECONDS,
        botThinkSeconds: DEFAULT_BOT_THINK_SECONDS,
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    return res.json(serializeBrandingSettings(reset));
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset branding" });
  }
});

// ---------------------------------------------------------------------------
// TMS (Ticket Management System) proxy/integration routes
// ---------------------------------------------------------------------------

app.get("/api/tms/health", async (_req, res) => {
  if (!isTmsConfigured()) {
    return res.status(200).json({
      configured: false,
      outboundEnabled: false,
      catalogEnabled: false,
      message:
        "TMS integration is not configured. Set TMS_API_BASE_URL to the TMS API root (e.g. https://tms.mapims.edu.in/api).",
    });
  }
  if (!isTmsOutboundEnabled() && !isTmsCatalogEnabled()) {
    return res.status(200).json({
      configured: true,
      outboundEnabled: false,
      catalogEnabled: false,
      reachable: false,
      message:
        "TMS URL is set but send/receive is disabled. Tickets stay in Feedback only unless you set TMS_OUTBOUND_ENABLED or TMS_CATALOG_ENABLED.",
    });
  }
  try {
    const result = await getTmsHealth();
    return res.status(result.ok ? 200 : 502).json({
      configured: true,
      outboundEnabled: isTmsOutboundEnabled(),
      catalogEnabled: isTmsCatalogEnabled(),
      reachable: result.ok,
      status: result.status,
      tms: result.body,
    });
  } catch (error) {
    const { status, body } = tmsErrorToHttp(error);
    return res.status(status).json({
      configured: true,
      outboundEnabled: isTmsOutboundEnabled(),
      catalogEnabled: isTmsCatalogEnabled(),
      reachable: false,
      ...body,
    });
  }
});

app.get("/api/tms/departments", async (_req, res) => {
  if (!isTmsCatalogEnabled()) {
    return res.status(503).json({ message: "TMS catalog pull is disabled on this server" });
  }
  try {
    const result = await listTmsDepartments();
    return res.json(result);
  } catch (error) {
    const { status, body } = tmsErrorToHttp(error);
    return res.status(status).json(body);
  }
});

app.get("/api/tms/tickets", async (req, res) => {
  if (!isTmsConfigured()) {
    return res.status(503).json({ message: "TMS integration is not configured" });
  }
  try {
    const result = await listTmsTickets(req.query || {});
    return res.json(result);
  } catch (error) {
    const { status, body } = tmsErrorToHttp(error);
    return res.status(status).json(body);
  }
});

app.get("/api/tms/tickets/:id", async (req, res) => {
  if (!isTmsConfigured()) {
    return res.status(503).json({ message: "TMS integration is not configured" });
  }
  try {
    const ticket = await getTmsTicket(req.params.id);
    return res.json(ticket);
  } catch (error) {
    const { status, body } = tmsErrorToHttp(error);
    return res.status(status).json(body);
  }
});

/**
 * Manually push a feedback to TMS (e.g. retry after a previous sync failure).
 * Accepts either the Feedback _id or the local ticketId.
 */
app.post("/api/tms/tickets/sync/:feedbackId", async (req, res) => {
  if (!isTmsOutboundEnabled()) {
    return res.status(403).json({
      message:
        "TMS outbound sync is disabled. Tickets are kept in the Feedback system only.",
    });
  }
  try {
    const { feedbackId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(feedbackId)
      ? { _id: feedbackId }
      : { ticketId: feedbackId };
    const feedback = await Feedback.findOne(query).lean();
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }
    if (!feedback.ticketId) {
      // Open a local ticket id first so the row is treated as a ticket.
      const ticketId = newTicketId();
      await Feedback.updateOne({ _id: feedback._id }, { $set: { ticketId, status: "New" } });
      feedback.ticketId = ticketId;
    }
    const updated = await syncFeedbackToTms(feedback, { reason: "manual_resync" });
    return res.json({
      ok: Boolean(updated?.tmsTicketId),
      feedback: updated,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to sync to TMS" });
  }
});

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    // eslint-disable-next-line no-console
    console.log(`[feedback] MongoDB connected: ${mongoose.connection.db.databaseName}`);
    await ensureDefaults();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Unable to start server", error);
    process.exit(1);
  }
}

startServer();
