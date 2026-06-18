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
import { combineFeedbackTextForAi } from "./feedbackText.js";
import { filterAiTopicsForTranscript } from "./aiTopicsFilter.js";
import {
  lookupPatientRecords,
  isEmrPatientLookupEnabled,
  listEmrDepartments,
} from "./emrPatientLookup.js";
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
  attachBotAnswerSentimentsFromIssues,
  buildBotCommentsFromAnswers,
  aiSentimentOnly,
  canOpenTicketForSentiment,
  ensureIssueTicketIds,
  ensureBotConversationConfig,
  registerBotConversationRoutes,
  saveBotAnswerRecording,
} from "./botConversation.js";
import { createPendingAiWorker } from "./pendingAiWorker.js";
import { buildFeedbackInsightsFilter } from "./insightsFeedbackQuery.js";

let pendingAiWorker = null;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

app.use(cors());
app.use(express.json());

const speechUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

const feedbackSubmitUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
}).fields([
  { name: "voiceRecording", maxCount: 1 },
  { name: "answerAudio", maxCount: 12 },
]);

const botAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

const voiceRecordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
}).single("voiceRecording");

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
const DEFAULT_BOT_SKIP_INTRO = false;
const DEFAULT_BOT_SKIP_THINK_COUNTDOWN = false;

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
      botSkipIntro: DEFAULT_BOT_SKIP_INTRO,
      botSkipThinkCountdown: DEFAULT_BOT_SKIP_THINK_COUNTDOWN,
    };
  }
  return {
    primaryColor: doc.primaryColor,
    accentColor: doc.accentColor || "#2FBF71",
    pageBackgroundColor: doc.pageBackgroundColor,
    logoDataUrl: doc.logoDataUrl ?? null,
    voiceRecordingMaxSeconds: normalizeVoiceRecordingMaxSeconds(doc.voiceRecordingMaxSeconds),
    botThinkSeconds: normalizeBotThinkSeconds(doc.botThinkSeconds),
    botSkipIntro: Boolean(doc.botSkipIntro ?? doc.botSkipIntroAndCountdown),
    botSkipThinkCountdown: Boolean(doc.botSkipThinkCountdown ?? doc.botSkipIntroAndCountdown),
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

/** Split tickets created after voice upload still need the parent recording path. */
async function propagateVoiceRecordingToGroup(feedbackId, voiceRecordingRelPath) {
  if (!voiceRecordingRelPath) return 0;
  const row = await Feedback.findById(feedbackId).select("submissionGroupId").lean();
  if (!row?.submissionGroupId) return 0;
  const result = await Feedback.updateMany(
    { submissionGroupId: row.submissionGroupId, _id: { $ne: feedbackId } },
    { $set: { voiceRecordingRelPath } }
  );
  return result.modifiedCount ?? 0;
}

function newTicketId() {
  return `TKT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
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
      botSkipIntro: DEFAULT_BOT_SKIP_INTRO,
      botSkipThinkCountdown: DEFAULT_BOT_SKIP_THINK_COUNTDOWN,
    });
  }

  await ensureBotConversationConfig();
}

/** Backfill voice path on split rows when parent already has audio (e.g. upload before AI split). */
/** Mongoose used to default clientSubmissionId to null — only one row could exist per unique sparse index. */
async function repairClientSubmissionIds() {
  const cleared = await Feedback.updateMany(
    { $or: [{ clientSubmissionId: null }, { clientSubmissionId: "" }] },
    { $unset: { clientSubmissionId: "" } }
  );
  if (cleared.modifiedCount > 0) {
    // eslint-disable-next-line no-console
    console.log("[feedback] cleared null clientSubmissionId values", {
      count: cleared.modifiedCount,
    });
  }
  try {
    const indexes = await Feedback.collection.indexes();
    const existing = indexes.find((idx) => idx.name === "clientSubmissionId_1");
    const hasPartial = Boolean(existing?.partialFilterExpression);
    if (existing && !hasPartial) {
      await Feedback.collection.dropIndex("clientSubmissionId_1");
      // eslint-disable-next-line no-console
      console.log("[feedback] dropped legacy clientSubmissionId index");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[feedback] could not inspect clientSubmissionId index", {
      message: err?.message || String(err),
    });
  }
  await Feedback.syncIndexes();
}

async function repairMissingSplitVoiceRecordings() {
  const parents = await Feedback.find({
    voiceRecordingRelPath: { $nin: [null, ""] },
    submissionGroupId: { $exists: true, $ne: null },
    isSplitChild: { $ne: true },
  })
    .select("_id submissionGroupId voiceRecordingRelPath")
    .lean();

  let repaired = 0;
  for (const parent of parents) {
    const result = await Feedback.updateMany(
      {
        submissionGroupId: parent.submissionGroupId,
        isSplitChild: true,
        $or: [{ voiceRecordingRelPath: null }, { voiceRecordingRelPath: "" }],
      },
      { $set: { voiceRecordingRelPath: parent.voiceRecordingRelPath } }
    );
    repaired += result.modifiedCount ?? 0;
  }
  if (repaired > 0) {
    // eslint-disable-next-line no-console
    console.log("[feedback] repaired split voice recording paths", { count: repaired });
  }
}


app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
  });
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
    const user = await User.findOne({ username: String(username).trim().toLowerCase() })
      .populate("departmentId", "name")
      .lean();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const dept =
      user.departmentId && typeof user.departmentId === "object"
        ? user.departmentId
        : null;
    return res.json({
      _id: String(user._id),
      username: user.username,
      role: user.role,
      departmentId: dept?._id ? String(dept._id) : user.departmentId ? String(user.departmentId) : null,
      departmentName: dept?.name || null,
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

async function loadServiceCatalogForAi() {
  const local = await loadLocalRoutingServicesFromDb();
  return [...local].sort((a, b) => a.name.localeCompare(b.name));
}

async function listServiceCatalogForUi() {
  const local = await loadLocalRoutingServicesFromDb();
  const items = local.map((row) => ({
    _id: row._id,
    name: row.name,
    description: row.description || "",
    source: "local",
    readOnly: false,
  }));
  return items.sort((a, b) => a.name.localeCompare(b.name));
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
  const rows = await Department.find()
    .populate("hodUserId", "username role")
    .sort({ name: 1 })
    .lean();
  return rows.map((row) => ({
    _id: String(row._id),
    name: row.name,
    description: row.description || "",
    services: Array.isArray(row.services) ? row.services : [],
    hodUserId: row.hodUserId
      ? {
          _id: String(row.hodUserId._id),
          username: row.hodUserId.username,
          role: row.hodUserId.role,
        }
      : null,
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
    const existing = await listHospitalDepartmentsFromDb();
    if (existing.length > 0) {
      return res.json(existing);
    }

    if (!isEmrPatientLookupEnabled()) {
      return res.json([]);
    }

    const emrDeptNames = await listEmrDepartments();
    if (!emrDeptNames.length) {
      return res.json([]);
    }

    await Department.bulkWrite(
      emrDeptNames.map((name) => ({
        updateOne: {
          filter: { name },
          update: { $setOnInsert: { name, description: "", services: [] } },
          upsert: true,
        },
      })),
      { ordered: false }
    );

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
    const { name, description, services, hodUserId } = req.body;
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
    if (hodUserId !== undefined) {
      if (!hodUserId) {
        update.hodUserId = null;
      } else if (mongoose.Types.ObjectId.isValid(String(hodUserId))) {
        const hodUser = await User.findById(hodUserId).lean();
        if (!hodUser || hodUser.role !== "hod") {
          return res.status(400).json({ message: "HOD must be a user with role hod" });
        }
        update.hodUserId = String(hodUserId);
      } else {
        return res.status(400).json({ message: "Invalid hodUserId" });
      }
    }
    const updated = await Department.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    })
      .populate("hodUserId", "username role")
      .lean();
    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json({
      _id: String(updated._id),
      name: updated.name,
      description: updated.description || "",
      services: Array.isArray(updated.services) ? updated.services : [],
      hodUserId: updated.hodUserId
        ? {
            _id: String(updated.hodUserId._id),
            username: updated.hodUserId.username,
            role: updated.hodUserId.role,
          }
        : null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
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
    if (!["admin", "staff", "hod"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);
    const deptOk =
      departmentId && mongoose.Types.ObjectId.isValid(String(departmentId));
    if ((role === "staff" || role === "hod") && !deptOk) {
      return res.status(400).json({ message: "departmentId is required for staff and HOD" });
    }
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
    if (!["admin", "staff", "hod"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const deptOk =
      departmentId && mongoose.Types.ObjectId.isValid(String(departmentId));
    if ((role === "staff" || role === "hod") && !deptOk) {
      return res.status(400).json({ message: "departmentId is required for staff and HOD" });
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
    }
    const withTickets = await Feedback.countDocuments({
      aiSentiment: "negative",
      ticketId: { $nin: [null, ""] },
    });
    return res.json({
      updated,
      negativeWithTicket: withTickets,
      tmsSynced: 0,
      tmsFailed: 0,
      tmsConfigured: false,
      tmsOutboundEnabled: false,
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

async function applyPendingAiToFeedback({
  feedbackId,
  pendingAi,
  patientName,
  comments,
  visitDepartment,
  normalizedService,
  serviceCatalog,
  numericRating,
  ticketId: initialTicketId,
  ticketRule: initialTicketRule,
  ticketIsFresh: initialTicketIsFresh,
  patientRegNo,
  patientEncounterType,
  ward,
  ipNo,
  visitOrAdmissionDate,
  submissionMode,
  botVoiceOverallSentiment,
  feedbackSource,
  feedbackLookupDepartment,
  botConversationAnswers,
}) {
  let ticketId = initialTicketId;
  let ticketRule = initialTicketRule;
  let ticketIsFresh = initialTicketIsFresh;
  let outDoc = null;
  const splitChildDocs = [];

  const feedback = await Feedback.findById(feedbackId).lean();
  if (!feedback) return { outDoc: null, splitChildDocs };

  outDoc = feedback;

  // eslint-disable-next-line no-console
  console.log("[feedback] applying OpenRouter analysis", {
    feedbackId: String(feedbackId),
    rating: pendingAi.rating,
  });
  const ai = pendingAi;
  const issueBundle = await applyIssueTicketsAndTms({
    feedbackId: String(feedbackId),
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
  let primarySentiment =
    aiSentimentOnly(primaryIssue?.sentiment) || aiSentimentOnly(ai.sentiment);
  if (!primarySentiment) {
    primarySentiment = aiSentimentOnly(botVoiceOverallSentiment);
  }
  issueBundle.issues = ensureIssueTicketIds(issueBundle.issues, { newTicketId });
  if (issueBundle.issues[0]?.ticketId && canOpenTicketForSentiment(primarySentiment)) {
    ticketId = issueBundle.issues[0].ticketId;
    ticketRule = ticketRule === "none" ? "ai_negative_sentiment" : ticketRule;
    ticketIsFresh = true;
  }

  const botAnswersWithSentiment =
    submissionMode === "bot" && (outDoc.botConversationAnswers || []).length
      ? attachBotAnswerSentimentsFromIssues(
          outDoc.botConversationAnswers,
          issueBundle.issues,
          primarySentiment
        )
      : botConversationAnswers || outDoc.botConversationAnswers;

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
    lookupDepartment: patientRegNo ? visitDepartment : feedbackLookupDepartment || "",
    suggestedAction: primaryIssue?.suggestedAction || "",
    feedbackIssues: issueBundle.issues,
    submissionGroupId: issueBundle.submissionGroupId,
    complaintSignature: buildComplaintSignature(
      primaryIssue?.department || visitDepartment,
      recommendedService,
      comments || ""
    ),
    ticketId: ticketId || null,
    ...(botAnswersWithSentiment?.length
      ? { botConversationAnswers: botAnswersWithSentiment }
      : {}),
  };

  if (!canOpenTicketForSentiment(primarySentiment)) {
    setFields.ticketId = null;
    ticketId = null;
    ticketRule = "none";
    ticketIsFresh = false;
    if (setFields.feedbackIssues?.[0]) {
      setFields.feedbackIssues[0].ticketId = null;
    }
  }
  if (Array.isArray(setFields.feedbackIssues) && setFields.feedbackIssues.length) {
    setFields.feedbackIssues = setFields.feedbackIssues.map((issue) => {
      const sentiment = aiSentimentOnly(issue?.sentiment);
      if (sentiment && !canOpenTicketForSentiment(sentiment)) {
        return { ...issue, ticketId: null };
      }
      return issue;
    });
  }

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
    feedbackId,
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
      source: feedbackSource || outDoc.source,
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
        aiSentimentOnly(issue?.sentiment) || aiSentimentOnly(ai.sentiment);
      const childSig = buildComplaintSignature(
        issue.department || visitDepartment,
        issue.recommendedService,
        issue.issueSummary
      );
      let childTicketId = issue.ticketId;
      let childTicketIsFresh = false;
      if (!canOpenTicketForSentiment(issueSentiment)) {
        childTicketId = null;
        childTicketIsFresh = false;
      } else if (!childTicketId) {
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
      splitChildDocs.push(child.toObject());
    }
  }

  const freshParent = await Feedback.findById(feedbackId)
    .select("voiceRecordingRelPath submissionGroupId")
    .lean();
  if (freshParent?.voiceRecordingRelPath) {
    const propagated = await propagateVoiceRecordingToGroup(
      feedbackId,
      freshParent.voiceRecordingRelPath
    );
    if (propagated > 0) {
      // eslint-disable-next-line no-console
      console.log("[feedback] propagated voice recording to split rows", {
        feedbackId: String(feedbackId),
        count: propagated,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log("[feedback] AI fields saved to DB", {
    feedbackId: String(feedbackId),
    aiSentiment: ai.sentiment,
    issueCount: issueBundle.issues.length,
    splitChildren: splitChildDocs.length,
    ticketOpenedForNegative: Boolean(setFields.ticketId),
  });

  return { outDoc, splitChildDocs, ticketId };
}

async function reanalyzeFeedbackById(feedbackId) {
  if (!process.env.OPENROUTER_API_KEY?.trim()) return false;

  const row = await Feedback.findById(feedbackId).lean();
  if (!row || row.isSplitChild) return false;

  const commentsForAi = combineFeedbackTextForAi(row.comments, row.staffRemarks);
  if (!commentsForAi) return false;

  const existing = row.aiSentiment;
  if (existing === "positive" || existing === "neutral" || existing === "negative") {
    return false;
  }

  const serviceCatalog = await loadServiceCatalogForAi();
  const visitDepartment = sanitizeOptionalLabel(row.lookupDepartment || row.department);

  await runDeferredFeedbackAiPipeline({
    feedbackId: row._id,
    patientName: row.patientName,
    comments: commentsForAi,
    visitDepartment,
    normalizedService: sanitizeOptionalLabel(row.service) || "",
    serviceCatalog,
    numericRating: row.rating,
    ticketId: row.ticketId,
    ticketRule: "none",
    ticketIsFresh: false,
    patientRegNo: row.patientRegNo || "",
    patientEncounterType: row.patientEncounterType || "",
    ward: row.ward || "",
    ipNo: row.ipNo || "",
    visitOrAdmissionDate: row.visitOrAdmissionDate || "",
    submissionMode: row.submissionMode || "standard",
    botVoiceOverallSentiment: null,
    feedbackSource: row.source,
    feedbackLookupDepartment: row.lookupDepartment || "",
    botConversationAnswers: row.botConversationAnswers || [],
  });

  const updated = await Feedback.findById(feedbackId).select("aiSentiment").lean();
  return (
    updated?.aiSentiment === "positive" ||
    updated?.aiSentiment === "neutral" ||
    updated?.aiSentiment === "negative"
  );
}

async function runDeferredFeedbackAiPipeline(ctx) {
  const {
    feedbackId,
    patientName,
    comments,
    visitDepartment,
    normalizedService,
    serviceCatalog,
    numericRating,
    ticketId,
    ticketRule,
    ticketIsFresh,
    patientRegNo,
    patientEncounterType,
    ward,
    ipNo,
    visitOrAdmissionDate,
    submissionMode,
    botVoiceOverallSentiment,
    feedbackSource,
    feedbackLookupDepartment,
    botConversationAnswers,
  } = ctx;

  let pendingAi = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      pendingAi = await analyzePatientFeedback(
        {
          patientName,
          patientDepartment: visitDepartment,
          department: visitDepartment,
          service: normalizedService,
          comments: comments || "",
        },
        {
          feedbackId: String(feedbackId),
          serviceChoices: serviceCatalog.map((d) => ({
            name: d.name,
            description: d.description || "",
          })),
        }
      );
      break;
    } catch (analyzeErr) {
      // eslint-disable-next-line no-console
      console.error("[feedback] deferred OpenRouter analyze failed", {
        feedbackId: String(feedbackId),
        attempt,
        message: analyzeErr?.message || String(analyzeErr),
      });
      if (attempt === 2) {
        pendingAiWorker?.scheduleRetry(feedbackId);
        return;
      }
    }
  }

  if (!pendingAi) {
    // eslint-disable-next-line no-console
    console.log("[feedback] deferred AI skipped (no OpenRouter result)", {
      feedbackId: String(feedbackId),
    });
    pendingAiWorker?.scheduleRetry(feedbackId);
    return;
  }

  try {
    await applyPendingAiToFeedback({
      feedbackId,
      pendingAi,
      patientName,
      comments,
      visitDepartment,
      normalizedService,
      serviceCatalog,
      numericRating,
      ticketId,
      ticketRule,
      ticketIsFresh,
      patientRegNo,
      patientEncounterType,
      ward,
      ipNo,
      visitOrAdmissionDate,
      submissionMode,
      botVoiceOverallSentiment,
      feedbackSource,
      feedbackLookupDepartment,
      botConversationAnswers,
    });
  } catch (aiErr) {
    // eslint-disable-next-line no-console
    console.error("[feedback] deferred AI apply failed", {
      feedbackId: String(feedbackId),
      message: aiErr?.message || String(aiErr),
    });
    pendingAiWorker?.scheduleRetry(feedbackId);
  }
}

registerBotConversationRoutes(app, { uploadsRoot: UPLOADS_ROOT, botAudioUpload });

app.post("/api/feedback", (req, res, next) => {
  feedbackSubmitUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          message:
            "Voice file is too large to upload. Please submit again — your spoken text will still be saved.",
        });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) return next(err);
    return next();
  });
}, async (req, res) => {
  try {
    const clientSubmissionId = String(req.body.clientSubmissionId || "").trim().slice(0, 128);
    if (clientSubmissionId) {
      const existing = await Feedback.findOne({ clientSubmissionId }).lean();
      if (existing) {
        const outDoc = attachVoicePlaybackUrl(existing);
        return res.status(200).json({
          ...outDoc,
          ticketRaised: Boolean(outDoc.ticketId),
          aiPending: false,
          tmsConfigured: false,
          tmsOutboundEnabled: false,
          tmsSyncHint: null,
          splitTickets: [],
          feedbackIssues: outDoc.feedbackIssues || [],
          idempotentReplay: true,
        });
      }
    }

    const patientName = req.body.patientName;
    let comments = req.body.comments;
    const source = req.body.source;
    const staffRemarks = String(req.body.staffRemarks || "").trim().slice(0, 2000);
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
      }
    }
    const commentsForAi = combineFeedbackTextForAi(comments, staffRemarks);
    const deferAiProcessing =
      submissionMode === "voice" || submissionMode === "standard" || submissionMode === "bot";
    const rawEncounter = String(req.body.patientEncounterType || "").toLowerCase().trim();
    const patientEncounterType = ["op", "ip"].includes(rawEncounter) ? rawEncounter : "";
    const patientRegNo = String(req.body.patientRegNo || "").trim().slice(0, 80);
    const ward = String(req.body.ward || "").trim().slice(0, 120);
    const ipNo = String(req.body.ipNo || "").trim().slice(0, 80);
    const visitOrAdmissionDate = String(req.body.visitOrAdmissionDate || "").trim().slice(0, 80);

    if (!patientName) {
      return res.status(400).json({ message: "patientName is required" });
    }

    const serviceCatalog = await loadServiceCatalogForAi();
    let numericRating = Number(rating);

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

    let pendingAi = null;
    let usedVoiceRatingForBot = false;
    let botVoiceOverallSentiment = null;

    // Bot: infer overall rating/sentiment once; full issue analysis runs in deferred pipeline.
    if (
      submissionMode === "bot" &&
      process.env.OPENROUTER_API_KEY &&
      botConversationAnswers.length > 0
    ) {
      // Quick overall rating/sentiment from combined bot transcripts (full issue analysis is deferred).
      try {
        const combinedTranscript = botConversationAnswers
          .map((a) => String(a.transcript || "").trim())
          .filter(Boolean)
          .join(" ");
        const overall = await inferRatingFromVoiceTranscript(
          combineFeedbackTextForAi(combinedTranscript, staffRemarks)
        );
        if (overall?.rating >= 1 && overall?.rating <= 5) {
          numericRating = overall.rating;
          usedVoiceRatingForBot = true;
        }
        if (
          overall?.sentiment &&
          ["positive", "neutral", "negative"].includes(overall.sentiment)
        ) {
          botVoiceOverallSentiment = overall.sentiment;
        }
      } catch {
        // Keep defaults if voice rating inference fails.
      }
    }
    if (
      !deferAiProcessing &&
      process.env.OPENROUTER_API_KEY &&
      commentsForAi
    ) {
      try {
        pendingAi = await analyzePatientFeedback(
          {
            patientName,
            patientDepartment: visitDepartment,
            department: visitDepartment,
            service: normalizedService,
            comments: commentsForAi,
          },
          {
            feedbackId: "submit",
            serviceChoices: serviceCatalog.map((d) => ({
              name: d.name,
              description: d.description || "",
            })),
          }
        );
        if (pendingAi?.rating >= 1 && pendingAi.rating <= 5) {
          if (submissionMode === "bot") {
            if (!usedVoiceRatingForBot) numericRating = pendingAi.rating;
          } else if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
            numericRating = pendingAi.rating;
          }
        }
      } catch (preAiErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] OpenRouter analyze failed (pre-create)", {
          message: preAiErr?.message || String(preAiErr),
        });
      }
    }

    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      numericRating = 3;
    }

    const complaintSignature = buildComplaintSignature(
      visitDepartment,
      normalizedService,
      commentsForAi
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
      staffRemarks,
      source: ["patient", "staff", "ai"].includes(source) ? source : "patient",
      complaintSignature,
      ticketId,
      submissionMode,
      botConversationAnswers,
      ...(clientSubmissionId ? { clientSubmissionId } : {}),
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

    if (
      !deferAiProcessing &&
      !pendingAi &&
      process.env.OPENROUTER_API_KEY &&
      commentsForAi
    ) {
      try {
        pendingAi = await analyzePatientFeedback(
          {
            patientName,
            patientDepartment: visitDepartment,
            department: visitDepartment,
            service: normalizedService,
            comments: commentsForAi,
          },
          {
            feedbackId: String(feedback._id),
            serviceChoices: serviceCatalog.map((d) => ({
              name: d.name,
              description: d.description || "",
            })),
          }
        );
        // eslint-disable-next-line no-console
        console.log("[feedback] OpenRouter retry after create succeeded", {
          feedbackId: String(feedback._id),
        });
      } catch (retryErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] OpenRouter analyze failed (post-create retry)", {
          feedbackId: String(feedback._id),
          message: retryErr?.message || String(retryErr),
        });
      }
    }

    if (!deferAiProcessing && pendingAi) {
      try {
        const aiResult = await applyPendingAiToFeedback({
          feedbackId: feedback._id,
          pendingAi,
          patientName,
          comments: commentsForAi,
          visitDepartment,
          normalizedService,
          serviceCatalog,
          numericRating,
          ticketId,
          ticketRule,
          ticketIsFresh,
          patientRegNo,
          patientEncounterType,
          ward,
          ipNo,
          visitOrAdmissionDate,
          submissionMode,
          botVoiceOverallSentiment,
          feedbackSource: outDoc.source,
          feedbackLookupDepartment: feedback.lookupDepartment || "",
          botConversationAnswers: outDoc.botConversationAnswers,
        });
        if (aiResult.outDoc) outDoc = aiResult.outDoc;
        if (aiResult.splitChildDocs?.length) splitChildDocs = aiResult.splitChildDocs;
        if (aiResult.ticketId) ticketId = aiResult.ticketId;
      } catch (aiErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] AI apply failed", {
          feedbackId: String(feedback._id),
          message: aiErr?.message || String(aiErr),
        });
      }
    } else if (!deferAiProcessing) {
      // eslint-disable-next-line no-console
      console.log(
        process.env.OPENROUTER_API_KEY
          ? "[feedback] AI analysis not applied (OpenRouter returned no result or comments were empty)"
          : "[feedback] AI analysis skipped (set OPENROUTER_API_KEY in .env to enable)"
      );
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
      } catch (voiceErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] failed to persist voice recording", {
          feedbackId: String(feedback._id),
          message: voiceErr?.message || String(voiceErr),
        });
      }
    }

    const payload = attachVoicePlaybackUrl(outDoc);
    const shouldDeferAi =
      deferAiProcessing &&
      process.env.OPENROUTER_API_KEY &&
      commentsForAi;

    if (shouldDeferAi) {
      setImmediate(() => {
        runDeferredFeedbackAiPipeline({
          feedbackId: feedback._id,
          patientName,
          comments: commentsForAi,
          visitDepartment,
          normalizedService,
          serviceCatalog,
          numericRating,
          ticketId,
          ticketRule,
          ticketIsFresh,
          patientRegNo,
          patientEncounterType,
          ward,
          ipNo,
          visitOrAdmissionDate,
          submissionMode,
          botVoiceOverallSentiment,
          feedbackSource: outDoc.source,
          feedbackLookupDepartment: feedback.lookupDepartment || "",
          botConversationAnswers: outDoc.botConversationAnswers,
        }).catch((deferErr) => {
          // eslint-disable-next-line no-console
          console.error("[feedback] deferred AI pipeline failed", {
            feedbackId: String(feedback._id),
            message: deferErr?.message || String(deferErr),
          });
        });
      });
    }

    return res.status(201).json({
      ...payload,
      ticketRaised: Boolean(outDoc.ticketId),
      aiPending: Boolean(shouldDeferAi),
      tmsConfigured: false,
      tmsOutboundEnabled: false,
      tmsSyncHint: null,
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
    // eslint-disable-next-line no-console
    console.error("[feedback] create failed", {
      message: error?.message || String(error),
    });
    return res.status(500).json({ message: "Failed to create feedback" });
  }
});

app.post("/api/feedback/:id/voice-recording", (req, res, next) => {
  voiceRecordingUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Voice file is too large (max 60 MB)." });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) return next(err);
    return next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ message: "voiceRecording file is required" });
    }

    const feedback = await Feedback.findById(id).lean();
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    if (feedback.voiceRecordingRelPath) {
      const existingRel = String(feedback.voiceRecordingRelPath);
      return res.json({
        voiceRecordingRelPath: existingRel,
        voiceRecordingUrl: `/uploads/${existingRel.replace(/^\/+/, "")}`,
        idempotentReplay: true,
      });
    }

    const rel = await saveFeedbackVoiceRecording(id, file.buffer, file.mimetype || "");
    await Feedback.updateOne({ _id: id }, { $set: { voiceRecordingRelPath: rel } });
    await propagateVoiceRecordingToGroup(id, rel);

    return res.json({
      voiceRecordingRelPath: rel,
      voiceRecordingUrl: `/uploads/${String(rel).replace(/^\/+/, "")}`,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[feedback] voice recording upload failed", {
      feedbackId: req.params.id,
      message: error?.message || String(error),
    });
    return res.status(500).json({ message: "Failed to save voice recording" });
  }
});

app.get("/api/feedback", async (req, res) => {
  try {
    const mongoFilter = buildFeedbackInsightsFilter(req.query);
    // Sort by insertion time from ObjectId to avoid skew from synthetic createdAt values.
    const feedback = await Feedback.find(mongoFilter).sort({ _id: -1 }).lean();
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
    const sessions = rows.filter((item) => !item.isSplitChild);

    const totals = {
      /** Every feedback row, including split issue tickets. */
      all: rows.length,
      positive: rows.filter((item) => item.aiSentiment === "positive").length,
      neutral: rows.filter((item) => item.aiSentiment === "neutral").length,
      negative: rows.filter((item) => item.aiSentiment === "negative").length,
      aiTickets: rows.filter((item) => item.source === "ai").length,
      averageRating: sessions.length
        ? Number(
            (sessions.reduce((sum, item) => sum + item.rating, 0) / sessions.length).toFixed(1)
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

app.patch("/api/feedback/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid feedback id" });
    }

    let assignFields = {
      assignedToUserId: null,
      assignedToUsername: "",
      assignedAt: null,
    };

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(String(userId))) {
        return res.status(400).json({ message: "Invalid user id" });
      }
      const user = await User.findById(userId).select("username role").lean();
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.role !== "hod") {
        return res.status(400).json({ message: "Tickets can only be assigned to HOD users" });
      }
      assignFields = {
        assignedToUserId: user._id,
        assignedToUsername: user.username,
        assignedAt: new Date(),
      };
    }

    const updated = await Feedback.findByIdAndUpdate(id, { $set: assignFields }, { new: true }).lean();
    if (!updated) {
      return res.status(404).json({ message: "Feedback not found" });
    }
    return res.json(attachVoicePlaybackUrl(updated));
  } catch (error) {
    return res.status(500).json({ message: "Failed to update ticket assignment" });
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
        botSkipIntro: DEFAULT_BOT_SKIP_INTRO,
      botSkipThinkCountdown: DEFAULT_BOT_SKIP_THINK_COUNTDOWN,
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
      botSkipIntro,
      botSkipThinkCountdown,
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
        botSkipIntro: Boolean(botSkipIntro),
        botSkipThinkCountdown: Boolean(botSkipThinkCountdown),
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
        botSkipIntro: DEFAULT_BOT_SKIP_INTRO,
      botSkipThinkCountdown: DEFAULT_BOT_SKIP_THINK_COUNTDOWN,
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    return res.json(serializeBrandingSettings(reset));
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset branding" });
  }
});

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    // eslint-disable-next-line no-console
    console.log(`[feedback] MongoDB connected: ${mongoose.connection.db.databaseName}`);
    await ensureDefaults();
    await repairClientSubmissionIds();
    await repairMissingSplitVoiceRecordings();

    pendingAiWorker = createPendingAiWorker({
      reanalyzeFeedbackById,
      isEnabled: () => Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    });
    pendingAiWorker.start();

    const server = app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`API running on http://localhost:${PORT}`);
    });
    server.timeout = 0;
    server.requestTimeout = 0;
    server.headersTimeout = 0;
    server.keepAliveTimeout = 0;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Unable to start server", error);
    process.exit(1);
  }
}

startServer();
