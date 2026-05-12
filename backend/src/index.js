import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import multer from "multer";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs/promises";
import {
  analyzePatientFeedback,
  resolveDepartmentHintWithGroq,
  inferRatingFromVoiceTranscript,
} from "./groqAnalysis.js";
import { extractSarvamTranscript, stringifySarvamError } from "./sarvamSpeech.js";
import { resolveDepartmentHeuristic } from "./departmentNormalize.js";
import {
  isTmsConfigured,
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

const feedbackVoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(UPLOADS_ROOT));

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
  },
  { timestamps: true }
);

const feedbackSchema = new mongoose.Schema(
  {
    patientName: { type: String, required: true, trim: true },
    department: { type: String, default: "", trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comments: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["New", "In Progress", "Resolved"],
      default: "New",
    },
    source: {
      type: String,
      enum: ["patient", "staff", "ai"],
      default: "patient",
    },
    complaintSignature: { type: String, default: "", index: true },
    ticketId: { type: String, default: null, index: true },
    aiSentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      default: null,
    },
    aiUrgency: {
      type: String,
      enum: ["low", "medium", "high"],
      default: null,
    },
    aiTopics: { type: [String], default: [] },
    aiSummary: { type: String, default: "" },
    aiAnalyzedAt: { type: Date, default: null },
    tmsTicketId: { type: String, default: null, index: true },
    tmsTicketNumber: { type: String, default: null, index: true },
    tmsTicketUrl: { type: String, default: null },
    tmsSyncedAt: { type: Date, default: null },
    tmsSyncError: { type: String, default: null },
    voiceRecordingRelPath: { type: String, default: null, index: false },
  },
  { timestamps: true }
);

function attachVoicePlaybackUrl(doc) {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (plain.voiceRecordingRelPath) {
    plain.voiceRecordingUrl = `/uploads/${String(plain.voiceRecordingRelPath).replace(/^\/+/, "")}`;
  }
  return plain;
}

async function saveFeedbackVoiceRecording(feedbackId, fileBuffer, mimeHint = "") {
  const ext = String(mimeHint).includes("mp4") ? "m4a" : "webm";
  const dir = path.join(UPLOADS_ROOT, "feedback-voice");
  await fs.mkdir(dir, { recursive: true });
  const rel = path.join("feedback-voice", `${feedbackId}.${ext}`).replace(/\\/g, "/");
  await fs.writeFile(path.join(UPLOADS_ROOT, rel), fileBuffer);
  return rel;
}

const brandingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    primaryColor: { type: String, required: true, default: "#2A6FDB" },
    pageBackgroundColor: { type: String, required: true, default: "#F5F7FA" },
    logoDataUrl: { type: String, default: null },
  },
  { timestamps: true }
);

const Department = mongoose.model("Department", departmentSchema);
const User = mongoose.model("User", userSchema);
const Feedback = mongoose.model("Feedback", feedbackSchema);
const Branding = mongoose.model("Branding", brandingSchema);

function newTicketId() {
  return `TKT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * Pushes a feedback record to TMS as a real ticket. If TMS isn't configured or
 * the call fails, we keep the local `ticketId` so the UI keeps working and we
 * stash the error on the feedback row for diagnostics. Returns the patched doc.
 */
async function syncFeedbackToTms(feedback, { reason } = {}) {
  if (!isTmsConfigured()) {
    // eslint-disable-next-line no-console
    console.log("[feedback] tms sync skipped", {
      feedbackId: String(feedback?._id || ""),
      reason: "TMS_API_BASE_URL not set",
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
    await Department.insertMany([
      { name: "Cardiology", description: "Heart care" },
      { name: "Neurology", description: "Brain & spine" },
      { name: "Emergency", description: "24/7 emergency" },
      { name: "Orthopedics", description: "Bones & joints" },
      { name: "Pediatrics", description: "Children" },
      { name: "General Medicine", description: "OPD" },
    ]);
  }

  const brandingCount = await Branding.countDocuments();
  if (brandingCount === 0) {
    await Branding.create({
      key: "global",
      primaryColor: "#2A6FDB",
      pageBackgroundColor: "#F5F7FA",
      logoDataUrl: null,
    });
  }
}

/**
 * Loads TMS departments for routing/Groq hints. Never throws — returns [] if TMS is
 * unreachable (common on production when the Feedback server cannot call tms.mapims.edu.in).
 */
async function loadTmsDepartmentDocsOrEmpty() {
  if (!isTmsConfigured()) {
    // eslint-disable-next-line no-console
    console.warn("[feedback] TMS_API_BASE_URL not set — department list disabled");
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

app.get("/api/departments", async (_req, res) => {
  const list = await loadTmsDepartmentDocsOrEmpty();
  return res.json(
    list.map((row) => ({
      _id: row._id,
      name: row.name,
      description: row.description || "",
    }))
  );
});

app.post("/api/departments", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const doc = await Department.create({
      name: String(name).trim(),
      description: String(description || "").trim(),
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

app.patch("/api/departments/:id", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const updated = await Department.findByIdAndUpdate(
      req.params.id,
      {
        name: String(name).trim(),
        description: String(description || "").trim(),
      },
      { new: true, runValidators: true }
    ).lean();
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

/** Ensures every Groq-negative feedback has a ticket id (open in Ticket Management) and reopens Resolved rows. */
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
      if (opened && isTmsConfigured() && !row.tmsTicketId) {
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
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to open negative tickets" });
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

app.post("/api/feedback", feedbackVoiceUpload.single("voiceRecording"), async (req, res) => {
  try {
    const patientName = req.body.patientName;
    const department = req.body.department;
    const comments = req.body.comments;
    const source = req.body.source;
    const rating = Number(req.body.rating);

    if (!patientName || !rating) {
      return res
        .status(400)
        .json({ message: "patientName and rating are required" });
    }

    const departmentDocs = await loadTmsDepartmentDocsOrEmpty();

    const numericRating = Number(rating);
    const deptHeuristic = resolveDepartmentHeuristic(department, departmentDocs);
    let normalizedDepartment = deptHeuristic.name;
    let departmentHintFromGroq = false;
    if (
      deptHeuristic.method === "unmatched" &&
      process.env.GROQ_API_KEY &&
      departmentDocs.length > 0
    ) {
      try {
        const fromAi = await resolveDepartmentHintWithGroq(department, departmentDocs);
        if (fromAi) {
          normalizedDepartment = fromAi;
          departmentHintFromGroq = true;
        }
      } catch (deptAiErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] department hint Groq failed", {
          message: deptAiErr?.message || String(deptAiErr),
        });
      }
    }
    const departmentProvided = Boolean(normalizedDepartment);
    const normalizedComments = String(comments || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const complaintSignature = `${normalizedDepartment.toLowerCase()}|${normalizedComments}`;
    let ticketId = null;
    let ticketRule = "none";
    let ticketIsFresh = false;

    // Critical feedback (rating 1) raises an immediate ticket.
    if (numericRating === 1) {
      ticketId = newTicketId();
      ticketIsFresh = true;
      ticketRule = "critical_immediate";
    }

    // Normal negative feedback (rating 2) raises ticket only:
    // - same issue is reported by multiple patients, and
    // - first similar report is at least 24 hours old.
    if (!ticketId && numericRating === 2 && normalizedComments) {
      const similarRows = await Feedback.find({
        rating: 2,
        complaintSignature,
      })
        .sort({ createdAt: 1 })
        .lean();

      const existingTicketId = similarRows.find((row) => row.ticketId)?.ticketId;
      if (existingTicketId) {
        ticketId = existingTicketId;
        ticketIsFresh = false;
        ticketRule = "normal_reuse_existing";
      } else {
        const distinctUsers = new Set(
          similarRows.map((row) => String(row.patientName || "").trim().toLowerCase())
        );
        distinctUsers.add(String(patientName).trim().toLowerCase());

        const firstSeenAt = similarRows[0] ? new Date(similarRows[0].createdAt).getTime() : Date.now();
        const ageHours = (Date.now() - firstSeenAt) / (1000 * 60 * 60);
        const shouldRaise = distinctUsers.size >= 2 && ageHours >= 24;

        if (shouldRaise) {
          ticketId = newTicketId();
          ticketIsFresh = true;
          ticketRule = "normal_after_24h_multi_patient";
          if (similarRows.length > 0) {
            await Feedback.updateMany(
              { _id: { $in: similarRows.map((row) => row._id) }, ticketId: null },
              { $set: { ticketId } }
            );
          }
        } else {
          ticketRule = "normal_waiting_window_or_duplicates";
        }
      }
    }

    const feedback = await Feedback.create({
      patientName,
      department: normalizedDepartment,
      rating: numericRating,
      comments: comments || "",
      source: ["patient", "staff", "ai"].includes(source) ? source : "patient",
      complaintSignature,
      ticketId,
    });

    let outDoc = feedback.toObject();

    // eslint-disable-next-line no-console
    console.log("[feedback] created", {
      id: String(feedback._id),
      rating: numericRating,
      source: outDoc.source,
      ticketId: ticketId || null,
      complaintTicketRaised: Boolean(ticketId),
      ticketRule,
      departmentHeuristic: deptHeuristic.method,
      departmentResolvedByGroqHint: departmentHintFromGroq,
    });

    if (process.env.GROQ_API_KEY) {
      try {
        // eslint-disable-next-line no-console
        console.log("[feedback] groq analysis starting", { feedbackId: String(feedback._id) });
        const ai = await analyzePatientFeedback(
          {
            patientName,
            department: normalizedDepartment,
            rating: numericRating,
            comments: comments || "",
          },
          {
            feedbackId: String(feedback._id),
            departmentChoices: departmentDocs.map((d) => ({
              name: d.name,
              description: d.description || "",
            })),
          }
        );
        if (ai) {
          const setFields = {
            aiSentiment: ai.sentiment,
            aiUrgency: ai.urgency,
            aiTopics: ai.topics.length ? ai.topics : [],
            aiSummary: ai.summary,
            aiAnalyzedAt: new Date(),
          };
          if (!departmentProvided && ai.inferredDepartment) {
            setFields.department = ai.inferredDepartment;
            setFields.complaintSignature = `${String(ai.inferredDepartment).toLowerCase()}|${normalizedComments}`;
          }
          if (ai.sentiment === "negative" && !feedback.ticketId) {
            setFields.ticketId = newTicketId();
            setFields.status = "New";
            ticketIsFresh = true;
            ticketRule = ticketRule === "none" ? "ai_negative_sentiment" : ticketRule;
          }
          const updated = await Feedback.findByIdAndUpdate(
            feedback._id,
            { $set: setFields },
            { new: true }
          ).lean();
          if (updated) {
            outDoc = updated;
          }
          // eslint-disable-next-line no-console
          console.log("[feedback] groq fields saved to DB", {
            feedbackId: String(feedback._id),
            aiSentiment: ai.sentiment,
            aiUrgency: ai.urgency,
            ticketOpenedForNegative: Boolean(setFields.ticketId),
            departmentInferred: Boolean(!departmentProvided && ai.inferredDepartment),
          });
        }
      } catch (groqErr) {
        // eslint-disable-next-line no-console
        console.error("[feedback] groq analysis failed", {
          feedbackId: String(feedback._id),
          message: groqErr?.message || String(groqErr),
        });
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("[feedback] groq skipped (set GROQ_API_KEY in .env to enable AI analysis)");
    }

    const tmsReady = isTmsConfigured();
    const willSyncTms = Boolean(
      outDoc.ticketId && ticketIsFresh && !outDoc.tmsTicketId && tmsReady
    );
    if (!tmsReady) {
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push skipped", {
        feedbackId: String(feedback._id),
        why: "TMS_API_BASE_URL not set",
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
          "TMS only runs when a feedback ticket is opened (rating 1, or rating 2 with multi-patient rule, or Groq negative sentiment). Rating 3–5 with neutral/positive AI usually does not open a ticket.",
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

    if (outDoc.ticketId && ticketIsFresh && !outDoc.tmsTicketId && isTmsConfigured()) {
      outDoc = await syncFeedbackToTms(outDoc, { reason: ticketRule });
      // eslint-disable-next-line no-console
      console.log("[feedback] tms push finished", {
        feedbackId: String(feedback._id),
        tmsTicketId: outDoc.tmsTicketId || null,
        tmsTicketNumber: outDoc.tmsTicketNumber || null,
        tmsSyncError: outDoc.tmsSyncError || null,
      });
    }

    if (req.file?.buffer?.length) {
      try {
        const rel = await saveFeedbackVoiceRecording(
          feedback._id,
          req.file.buffer,
          req.file.mimetype || ""
        );
        await Feedback.updateOne({ _id: feedback._id }, { $set: { voiceRecordingRelPath: rel } });
        outDoc = { ...outDoc, voiceRecordingRelPath: rel };
        const tmsId = outDoc.tmsTicketId;
        if (tmsId && isTmsConfigured()) {
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
    return res.status(201).json({
      ...payload,
      ticketRaised: Boolean(outDoc.ticketId),
      tmsConfigured: isTmsConfigured(),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create feedback" });
  }
});

app.get("/api/feedback", async (_req, res) => {
  try {
    // Sort by insertion time from ObjectId to avoid skew from synthetic createdAt values.
    const feedback = await Feedback.find().sort({ _id: -1 }).lean();
    return res.json(feedback.map((row) => attachVoicePlaybackUrl(row)));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch feedback" });
  }
});

app.get("/api/analytics", async (_req, res) => {
  try {
    const rows = await Feedback.find().lean();

    const totals = {
      all: rows.length,
      // Sentiment is AI-derived (Groq), not inferred from numeric rating
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
    const departmentNegativeCounter = {};
    const dailyCounter = {};

    for (const item of rows) {
      const st = ["New", "In Progress", "Resolved"].includes(item.status)
        ? item.status
        : "New";
      statusCounter[st] = (statusCounter[st] || 0) + 1;

      if (item.aiSentiment === "negative") {
        const department = item.department || "Unknown";
        departmentNegativeCounter[department] =
          (departmentNegativeCounter[department] || 0) + 1;
      }

      const day = new Date(item.createdAt).toISOString().slice(0, 10);
      dailyCounter[day] = (dailyCounter[day] || 0) + 1;
    }

    const byStatus = Object.entries(statusCounter).map(([status, count]) => ({
      status,
      count,
    }));

    const negativeByDepartment = Object.entries(departmentNegativeCounter)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    const submissionsByDay = Object.entries(dailyCounter)
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14);

    return res.json({
      totals,
      byStatus,
      negativeByDepartment,
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
        pageBackgroundColor: "#F5F7FA",
        logoDataUrl: null,
      });
      return res.json({
        primaryColor: branding.primaryColor,
        pageBackgroundColor: branding.pageBackgroundColor,
        logoDataUrl: branding.logoDataUrl,
      });
    }
    return res.json({
      primaryColor: branding.primaryColor,
      pageBackgroundColor: branding.pageBackgroundColor,
      logoDataUrl: branding.logoDataUrl,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch branding" });
  }
});

app.put("/api/branding", async (req, res) => {
  try {
    const { primaryColor, pageBackgroundColor, logoDataUrl } = req.body;
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
        pageBackgroundColor: String(pageBackgroundColor).trim(),
        logoDataUrl: typeof logoDataUrl === "string" ? logoDataUrl : null,
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    return res.json({
      primaryColor: updated.primaryColor,
      pageBackgroundColor: updated.pageBackgroundColor,
      logoDataUrl: updated.logoDataUrl,
    });
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
        pageBackgroundColor: "#F5F7FA",
        logoDataUrl: null,
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    return res.json({
      primaryColor: reset.primaryColor,
      pageBackgroundColor: reset.pageBackgroundColor,
      logoDataUrl: reset.logoDataUrl,
    });
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
      message:
        "TMS integration is not configured. Set TMS_API_BASE_URL to the TMS API root (e.g. https://tms.mapims.edu.in/api).",
    });
  }
  try {
    const result = await getTmsHealth();
    return res.status(result.ok ? 200 : 502).json({
      configured: true,
      reachable: result.ok,
      status: result.status,
      tms: result.body,
    });
  } catch (error) {
    const { status, body } = tmsErrorToHttp(error);
    return res.status(status).json({ configured: true, reachable: false, ...body });
  }
});

app.get("/api/tms/departments", async (_req, res) => {
  if (!isTmsConfigured()) {
    return res.status(503).json({ message: "TMS integration is not configured" });
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
  if (!isTmsConfigured()) {
    return res.status(503).json({ message: "TMS integration is not configured" });
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
