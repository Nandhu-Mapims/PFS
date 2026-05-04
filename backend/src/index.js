import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { analyzePatientFeedback } from "./groqAnalysis.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

app.use(cors());
app.use(express.json());

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
  },
  { timestamps: true }
);

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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
  try {
    const list = await Department.find().sort({ name: 1 }).lean();
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ message: "Failed to list departments" });
  }
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
    for (const row of rows) {
      const set = {};
      if (!row.ticketId) {
        set.ticketId = newTicketId();
        set.status = "New";
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
    return res.json({ updated, negativeWithTicket: withTickets });
  } catch (error) {
    return res.status(500).json({ message: "Failed to open negative tickets" });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const { patientName, department, rating, comments, source } = req.body;

    if (!patientName || !rating) {
      return res
        .status(400)
        .json({ message: "patientName and rating are required" });
    }

    const numericRating = Number(rating);
    const normalizedDepartment = String(department || "").trim();
    const departmentProvided = Boolean(normalizedDepartment);
    const normalizedComments = String(comments || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const complaintSignature = `${normalizedDepartment.toLowerCase()}|${normalizedComments}`;
    let ticketId = null;
    let ticketRule = "none";

    // Critical feedback (rating 1) raises an immediate ticket.
    if (numericRating === 1) {
      ticketId = newTicketId();
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
      rating,
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
    });

    if (process.env.GROQ_API_KEY) {
      try {
        const departmentChoices = await Department.find()
          .sort({ name: 1 })
          .select("name description")
          .lean();
        // eslint-disable-next-line no-console
        console.log("[feedback] groq analysis starting", { feedbackId: String(feedback._id) });
        const ai = await analyzePatientFeedback(
          {
            patientName,
            department: normalizedDepartment,
            rating: Number(rating),
            comments: comments || "",
          },
          {
            feedbackId: String(feedback._id),
            departmentChoices: departmentChoices.map((d) => ({
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

    return res.status(201).json({
      ...outDoc,
      ticketRaised: Boolean(outDoc.ticketId),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create feedback" });
  }
});

app.get("/api/feedback", async (_req, res) => {
  try {
    // Sort by insertion time from ObjectId to avoid skew from synthetic createdAt values.
    const feedback = await Feedback.find().sort({ _id: -1 }).lean();
    return res.json(feedback);
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

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update feedback status" });
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
