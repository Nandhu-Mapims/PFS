import mongoose from "mongoose";

const departmentServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
  },
  { _id: true }
);

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "", trim: true },
    services: { type: [departmentServiceSchema], default: [] },
  },
  { timestamps: true }
);

const routingServiceSchema = new mongoose.Schema(
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
    patientRegNo: { type: String, default: "", trim: true },
    patientEncounterType: { type: String, enum: ["", "op", "ip"], default: "" },
    ward: { type: String, default: "", trim: true },
    ipNo: { type: String, default: "", trim: true },
    visitOrAdmissionDate: { type: String, default: "", trim: true },
    department: { type: String, default: "", trim: true },
    lookupDepartment: { type: String, default: "", trim: true, index: true },
    service: { type: String, default: "", trim: true },
    suggestedAction: { type: String, default: "", trim: true },
    feedbackIssues: {
      type: [
        {
          department: { type: String, default: "", trim: true },
          recommendedService: { type: String, default: "", trim: true },
          issueSummary: { type: String, default: "", trim: true },
          suggestedAction: { type: String, default: "", trim: true },
          sentiment: {
            type: String,
            enum: ["positive", "neutral", "negative"],
            default: null,
          },
          ticketId: { type: String, default: null },
        },
      ],
      default: [],
    },
    submissionGroupId: { type: String, default: null, index: true },
    /** Client-generated id for idempotent offline/outbox retries */
    clientSubmissionId: { type: String, default: null, sparse: true, unique: true, index: true },
    isSplitChild: { type: Boolean, default: false },
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
    voiceRecordingRelPath: { type: String, default: null },
    submissionMode: {
      type: String,
      enum: ["standard", "voice", "bot"],
      default: "standard",
    },
    botConversationAnswers: {
      type: [
        {
          questionOrder: { type: Number, required: true },
          questionText: { type: String, default: "" },
          transcript: { type: String, default: "" },
          audioRelPath: { type: String, default: null },
          answerSentiment: {
            type: String,
            enum: ["positive", "neutral", "negative"],
            default: null,
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ createdAt: -1, patientEncounterType: 1 });

const botQuestionSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    textTa: { type: String, required: true, trim: true },
    audioRelPath: { type: String, default: null },
    videoRelPath: { type: String, default: null },
  },
  { _id: false }
);

const botConversationConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    introText: { type: String, default: "" },
    introAudioRelPath: { type: String, default: null },
    introVideoRelPath: { type: String, default: null },
    questions: { type: [botQuestionSchema], default: [] },
  },
  { timestamps: true }
);

const brandingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    primaryColor: { type: String, required: true, default: "#2A6FDB" },
    accentColor: { type: String, required: true, default: "#2FBF71" },
    pageBackgroundColor: { type: String, required: true, default: "#F5F7FA" },
    logoDataUrl: { type: String, default: null },
    /** Max seconds for patient voice feedback recording (admin-controlled). */
    voiceRecordingMaxSeconds: { type: Number, default: 120, min: 15, max: 600 },
    /** Countdown after each bot question before recording (AI Voice Guide). */
    botThinkSeconds: { type: Number, default: 3, min: 1, max: 30 },
  },
  { timestamps: true }
);

export const Department = mongoose.model("Department", departmentSchema);
export const RoutingService = mongoose.model("RoutingService", routingServiceSchema);
export const User = mongoose.model("User", userSchema);
export const Feedback = mongoose.model("Feedback", feedbackSchema);
export const Branding = mongoose.model("Branding", brandingSchema);
export const BotConversationConfig = mongoose.model(
  "BotConversationConfig",
  botConversationConfigSchema
);

export { mongoose };
