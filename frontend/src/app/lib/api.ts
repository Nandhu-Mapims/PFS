export interface FeedbackIssue {
  department: string;
  recommendedService: string;
  issueSummary: string;
  suggestedAction: string;
  sentiment?: "positive" | "neutral" | "negative" | null;
  ticketId?: string | null;
}

export interface BotConversationAnswer {
  questionOrder: number;
  questionText: string;
  transcript: string;
  audioRelPath?: string | null;
  audioUrl?: string | null;
  /** Per-question AI sentiment from voice transcript */
  answerSentiment?: "positive" | "neutral" | "negative" | null;
}

export interface BotConversationQuestion {
  order: number;
  textTa: string;
  audioUrl: string | null;
  /** @deprecated use audioUrl */
  videoUrl?: string | null;
}

export interface BotConversationConfig {
  key: string;
  introText: string;
  introAudioUrl: string | null;
  /** @deprecated use introAudioUrl */
  introVideoUrl?: string | null;
  questions: BotConversationQuestion[];
  updatedAt?: string;
}

export interface FeedbackPayload {
  patientName: string;
  /** Visit department: from UHID/EMR or selected hospital department (name-only) */
  department?: string;
  /** Stored for analytics — same as department when known at submit */
  lookupDepartment?: string;
  /** Optional service hint; AI normally picks service from routing catalog */
  service?: string;
  rating: number;
  comments: string;
  source?: "patient" | "staff" | "ai";
  /** When set, multipart upload stores audio under this feedback (voice flow). */
  voiceRecording?: Blob | null;
  submissionMode?: "standard" | "voice" | "bot";
  conversationAnswers?: BotConversationAnswer[];
  answerAudioBlobs?: Blob[];
  /** Hospital registration number / UHID when supplied or resolved via EMR lookup */
  patientRegNo?: string;
  patientEncounterType?: "op" | "ip" | "";
  ward?: string;
  ipNo?: string;
  visitOrAdmissionDate?: string;
  /** Idempotent key from offline outbox — safe to retry POST /api/feedback */
  clientSubmissionId?: string;
}

export interface PatientLookupMatch {
  encounterType: "op" | "ip";
  regNo: string;
  patientName: string;
  department: string;
  ward: string;
  patientType: string;
  ipNo: string;
  visitDate: string;
  admissionDate: string;
  tokenNo: string;
  frmDate: string;
  toDate: string;
  key: string;
}

export interface BrandingSettings {
  primaryColor: string;
  accentColor: string;
  pageBackgroundColor: string;
  logoDataUrl: string | null;
  /** Max seconds for voice feedback recording (15–600). */
  voiceRecordingMaxSeconds: number;
  /** Seconds to think after each bot question before recording (1–30). */
  botThinkSeconds: number;
}

export interface CreateFeedbackResponse extends FeedbackItem {
  ticketRaised?: boolean;
  /** TMS integration removed (kept for backward compatibility). */
  tmsConfigured?: boolean;
  /** TMS integration removed (kept for backward compatibility). */
  tmsSyncHint?: string | null;
  splitTickets?: Array<{
    _id: string;
    ticketId?: string | null;
    department?: string;
    service?: string;
    suggestedAction?: string;
  }>;
  feedbackIssues?: FeedbackIssue[];
}

export interface FeedbackItem extends Omit<FeedbackPayload, "voiceRecording"> {
  _id: string;
  status: "New" | "In Progress" | "Resolved";
  source: "patient" | "staff" | "ai";
  createdAt: string;
  updatedAt: string;
  ticketId?: string | null;
  aiSentiment?: "positive" | "neutral" | "negative" | null;
  aiUrgency?: "low" | "medium" | "high" | null;
  aiTopics?: string[];
  aiSummary?: string;
  aiAnalyzedAt?: string | null;
  voiceRecordingRelPath?: string | null;
  voiceRecordingUrl?: string | null;
  submissionMode?: "standard" | "voice" | "bot";
  botConversationAnswers?: BotConversationAnswer[];
  service?: string;
  /** Department from EMR at submit time (analytics source of truth) */
  lookupDepartment?: string;
  suggestedAction?: string;
  feedbackIssues?: FeedbackIssue[];
  submissionGroupId?: string | null;
  isSplitChild?: boolean;
  /** Set when split ticket borrows bot Q&A from parent submission */
  botVoiceSourceFeedbackId?: string | null;
}

export interface SentimentCountRow {
  count: number;
}

export interface DepartmentCountRow extends SentimentCountRow {
  department: string;
}

export interface ServiceCountRow extends SentimentCountRow {
  service: string;
}

export interface FeedbackAnalytics {
  totals: {
    all: number;
    positive: number;
    neutral: number;
    negative: number;
    aiTickets: number;
    averageRating: number;
  };
  byStatus: Array<{ status: FeedbackItem["status"]; count: number }>;
  negativeByDepartment: DepartmentCountRow[];
  positiveByDepartment: DepartmentCountRow[];
  /** All submissions with a known EMR lookup department */
  submissionsByDepartment: DepartmentCountRow[];
  negativeByService: ServiceCountRow[];
  positiveByService: ServiceCountRow[];
  submissionsByDay: Array<{ day: string; count: number }>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

/** Resolve /uploads/... paths — same origin in dev (Vite proxies /uploads to API). */
export function resolveUploadUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export async function getApiHealth(): Promise<{ ok: boolean; openRouterConfigured?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/health`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, openRouterConfigured: false };
  }
  return body as { ok: boolean; openRouterConfigured?: boolean };
}

export async function createFeedback(payload: FeedbackPayload): Promise<CreateFeedbackResponse> {
  const { voiceRecording, ...fields } = payload;

  const appendEmrFields = (fd: FormData) => {
    if (fields.patientRegNo != null && fields.patientRegNo !== "") {
      fd.append("patientRegNo", fields.patientRegNo);
    }
    if (fields.lookupDepartment != null && fields.lookupDepartment !== "") {
      fd.append("lookupDepartment", fields.lookupDepartment);
    }
    if (fields.patientEncounterType != null && fields.patientEncounterType !== "") {
      fd.append("patientEncounterType", fields.patientEncounterType);
    }
    if (fields.ward != null && fields.ward !== "") fd.append("ward", fields.ward);
    if (fields.ipNo != null && fields.ipNo !== "") fd.append("ipNo", fields.ipNo);
    if (fields.visitOrAdmissionDate != null && fields.visitOrAdmissionDate !== "") {
      fd.append("visitOrAdmissionDate", fields.visitOrAdmissionDate);
    }
  };

  const fd = new FormData();
  if (fields.clientSubmissionId) {
    fd.append("clientSubmissionId", fields.clientSubmissionId);
  }
  fd.append("patientName", fields.patientName);
  if (fields.department != null && fields.department !== "") {
    fd.append("department", fields.department);
  }
  if (fields.service != null && fields.service !== "") {
    fd.append("service", fields.service);
  }
  fd.append("rating", String(fields.rating));
  fd.append("comments", fields.comments ?? "");
  if (fields.source) fd.append("source", fields.source);
  fd.append(
    "submissionMode",
    fields.submissionMode || (voiceRecording?.size ? "voice" : "standard")
  );
  appendEmrFields(fd);

  if (voiceRecording && voiceRecording.size > 0) {
    const mime = voiceRecording.type || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : "webm";
    fd.append("voiceRecording", voiceRecording, `voice-feedback.${ext}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: "POST",
    body: fd,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
      throw new Error(body.message);
    }
    if (response.status === 413) {
      throw new Error(
        "Upload too large. Your spoken text can still be saved — please submit again."
      );
    }
    throw new Error("Could not save feedback");
  }

  return body as CreateFeedbackResponse;
}

/** Upload voice audio after feedback text is saved (supports large recordings without blocking submit). */
export async function uploadFeedbackVoiceRecording(
  feedbackId: string,
  voiceRecording: Blob
): Promise<{ voiceRecordingUrl?: string | null }> {
  const fd = new FormData();
  const mime = voiceRecording.type || "audio/webm";
  const ext = mime.includes("mp4") ? "m4a" : "webm";
  fd.append("voiceRecording", voiceRecording, `voice-feedback.${ext}`);

  const response = await fetch(`${API_BASE_URL}/api/feedback/${feedbackId}/voice-recording`, {
    method: "POST",
    body: fd,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
      throw new Error(body.message);
    }
    if (response.status === 413) {
      throw new Error("Your feedback was saved, but the recording was too large to send.");
    }
    throw new Error("Your feedback was saved, but we could not finish sending everything.");
  }

  return (body || {}) as { voiceRecordingUrl?: string | null };
}

export async function getBotConversationConfig(): Promise<BotConversationConfig> {
  const response = await fetch(`${API_BASE_URL}/api/bot-conversation`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not load bot conversation");
  }
  return body as BotConversationConfig;
}

export async function getAdminBotConversationConfig(): Promise<BotConversationConfig> {
  const response = await fetch(`${API_BASE_URL}/api/admin/bot-conversation`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not load bot conversation");
  }
  return body as BotConversationConfig;
}

export async function saveAdminBotConversationConfig(payload: {
  introText?: string;
  questions?: Array<{
    order: number;
    textTa: string;
    audioRelPath?: string | null;
    audioUrl?: string | null;
  }>;
}): Promise<BotConversationConfig> {
  const response = await fetch(`${API_BASE_URL}/api/admin/bot-conversation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not save bot conversation");
  }
  return body as BotConversationConfig;
}

export async function uploadBotIntroAudio(file: File): Promise<BotConversationConfig> {
  const fd = new FormData();
  fd.append("audio", file, file.name);
  const response = await fetch(`${API_BASE_URL}/api/admin/bot-conversation/intro-audio`, {
    method: "POST",
    body: fd,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not upload intro audio");
  }
  return body as BotConversationConfig;
}

export async function uploadBotQuestionAudio(
  order: number,
  file: File
): Promise<BotConversationConfig> {
  const fd = new FormData();
  fd.append("audio", file, file.name);
  const response = await fetch(
    `${API_BASE_URL}/api/admin/bot-conversation/questions/${order}/audio`,
    { method: "POST", body: fd }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not upload question audio");
  }
  return body as BotConversationConfig;
}

/** Bot conversation submit — one audio blob per answer, in question order. */
export async function createBotFeedback(
  payload: FeedbackPayload & {
    conversationAnswers: BotConversationAnswer[];
    answerAudioBlobs: Blob[];
  }
): Promise<CreateFeedbackResponse> {
  const { answerAudioBlobs, conversationAnswers, voiceRecording: _v, ...fields } = payload;
  const fd = new FormData();
  fd.append("patientName", fields.patientName);
  if (fields.department) fd.append("department", fields.department);
  if (fields.lookupDepartment) fd.append("lookupDepartment", fields.lookupDepartment);
  if (fields.service) fd.append("service", fields.service);
  fd.append("rating", String(fields.rating));
  fd.append("comments", fields.comments ?? "");
  if (fields.source) fd.append("source", fields.source);
  fd.append("submissionMode", "bot");
  fd.append("conversationAnswers", JSON.stringify(conversationAnswers));
  if (fields.patientRegNo) fd.append("patientRegNo", fields.patientRegNo);
  if (fields.patientEncounterType) fd.append("patientEncounterType", fields.patientEncounterType);
  if (fields.ward) fd.append("ward", fields.ward);
  if (fields.ipNo) fd.append("ipNo", fields.ipNo);
  if (fields.visitOrAdmissionDate) fd.append("visitOrAdmissionDate", fields.visitOrAdmissionDate);

  for (let i = 0; i < answerAudioBlobs.length; i++) {
    const blob = answerAudioBlobs[i];
    if (!blob?.size) continue;
    const mime = blob.type || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : "webm";
    fd.append("answerAudio", blob, `answer-${i}.${ext}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/feedback`, { method: "POST", body: fd });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not save feedback");
  }
  return body as CreateFeedbackResponse;
}

export async function lookupPatientRecords(payload: {
  regNo?: string;
  patientName?: string;
  frmDate?: string;
  toDate?: string;
}): Promise<{ frmDate: string; toDate: string; matches: PatientLookupMatch[] }> {
  const response = await fetch(`${API_BASE_URL}/api/patient/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      typeof body === "object" && body && "message" in body && typeof (body as { message?: string }).message === "string"
        ? (body as { message: string }).message
        : "Patient lookup failed";
    throw new Error(msg);
  }
  return body as { frmDate: string; toDate: string; matches: PatientLookupMatch[] };
}

export async function getFeedback(): Promise<FeedbackItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load feedback");
  }

  return response.json();
}

export async function getFeedbackById(id: string): Promise<FeedbackItem> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Ticket not found");
  }
  return body as FeedbackItem;
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackItem["status"]
): Promise<FeedbackItem> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error("Could not update status");
  }

  return response.json();
}

export async function deleteFeedback(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Could not delete feedback");
  }
}

export async function getFeedbackAnalytics(): Promise<FeedbackAnalytics> {
  const response = await fetch(`${API_BASE_URL}/api/analytics`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load analytics");
  }

  return response.json();
}

export async function seedOpenNegativeTickets(): Promise<{
  updated: number;
  negativeWithTicket: number;
}> {
  const response = await fetch(`${API_BASE_URL}/api/seed/open-negative-tickets`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Could not open tickets for negative AI sentiment");
  }
  return response.json();
}

export interface DepartmentService {
  _id?: string;
  name: string;
  description?: string;
}

export interface Department {
  _id: string;
  name: string;
  description?: string;
  services?: DepartmentService[];
  createdAt: string;
}

/** Hospital departments stored in MongoDB (staff assignment, local catalog). */
export async function getHospitalDepartments(): Promise<Department[]> {
  const response = await fetch(`${API_BASE_URL}/api/hospital-departments`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load departments");
  return response.json();
}

/** @deprecated alias — use getHospitalDepartments */
export async function getDepartments(): Promise<Department[]> {
  const response = await fetch(`${API_BASE_URL}/api/departments`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load departments");
  return response.json();
}

export interface ServiceCatalogItem {
  _id: string;
  name: string;
  description?: string;
  source: "tms" | "local";
  readOnly: boolean;
}

/** Routing catalog for AI / tickets (TMS + local services). */
export async function getServices(): Promise<ServiceCatalogItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/services`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load services");
  return response.json();
}

export async function createService(payload: {
  name: string;
  description?: string;
}): Promise<ServiceCatalogItem> {
  const response = await fetch(`${API_BASE_URL}/api/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Create failed");
  }
  return response.json();
}

export async function updateService(
  id: string,
  payload: { name: string; description?: string }
): Promise<ServiceCatalogItem> {
  const response = await fetch(`${API_BASE_URL}/api/services/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Update failed");
  }
  return response.json();
}

export async function deleteService(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/services/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Delete failed");
}

export async function createHospitalDepartment(payload: {
  name: string;
  description?: string;
  services?: DepartmentService[];
}): Promise<Department> {
  const response = await fetch(`${API_BASE_URL}/api/hospital-departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Create failed");
  }
  return response.json();
}

export async function updateHospitalDepartment(
  id: string,
  payload: {
    name: string;
    description?: string;
    services?: DepartmentService[];
  }
): Promise<Department> {
  const response = await fetch(`${API_BASE_URL}/api/hospital-departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Update failed");
  }
  return response.json();
}

export async function deleteHospitalDepartment(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/hospital-departments/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Delete failed");
}

export async function createDepartment(payload: {
  name: string;
  description?: string;
}): Promise<Department> {
  const response = await fetch(`${API_BASE_URL}/api/departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Create failed");
  }
  return response.json();
}

export async function deleteDepartment(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/departments/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Delete failed");
}

export async function updateDepartment(
  id: string,
  payload: {
    name: string;
    description?: string;
  }
): Promise<Department> {
  const response = await fetch(`${API_BASE_URL}/api/departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Update failed");
  }
  return response.json();
}

export interface UserRow {
  _id: string;
  username: string;
  role: "admin" | "staff";
  departmentId?: { _id: string; name: string } | null;
}

export async function getUsers(): Promise<UserRow[]> {
  const response = await fetch(`${API_BASE_URL}/api/users`);
  if (!response.ok) throw new Error("Could not load users");
  return response.json();
}

export async function createUser(payload: {
  username: string;
  password: string;
  role: "admin" | "staff";
  departmentId?: string | null;
}): Promise<UserRow> {
  const response = await fetch(`${API_BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Create user failed");
  }
  return response.json();
}

export async function updateUser(
  id: string,
  payload: {
    username: string;
    role: "admin" | "staff";
    departmentId?: string | null;
    password?: string;
  }
): Promise<UserRow> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Update user failed");
  }
  return response.json();
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Delete user failed");
  }
}

export async function getBrandingSettingsApi(): Promise<BrandingSettings> {
  const response = await fetch(`${API_BASE_URL}/api/branding`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not load branding");
  }
  return response.json();
}

export async function saveBrandingSettingsApi(
  payload: BrandingSettings
): Promise<BrandingSettings> {
  const response = await fetch(`${API_BASE_URL}/api/branding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Could not save branding");
  }
  return response.json();
}

export async function resetBrandingSettingsApi(): Promise<BrandingSettings> {
  const response = await fetch(`${API_BASE_URL}/api/branding`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Could not reset branding");
  }
  return response.json();
}

export interface TranscribeSpeechResponse {
  transcript: string;
  language_code?: string | null;
  request_id?: string | null;
}

export type SpeechLanguageCode =
  | "unknown"
  | "en-IN"
  | "hi-IN"
  | "ta-IN"
  | "te-IN"
  | "kn-IN";

function readApiErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") {
    return typeof body === "string" ? body : "Request failed";
  }
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string" && b.message.trim()) {
    return b.message.trim().slice(0, 900);
  }
  const nested = b.error;
  if (nested && typeof nested === "object" && typeof (nested as { message?: unknown }).message === "string") {
    const m = (nested as { message: string }).message.trim();
    if (m) return m.slice(0, 900);
  }
  try {
    const s = JSON.stringify(body);
    return s.length <= 600 ? s : `${s.slice(0, 600)}…`;
  } catch {
    return "Request failed";
  }
}

/** Safe string for UI (avoid "[object Object]" if API shape differs). */
export function coerceTranscriptText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw.map(coerceTranscriptText).join(" ").trim();
  }
  if (raw != null && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const inner = o.text ?? o.content ?? o.value ?? o.utterance ?? o.transcript;
    if (typeof inner === "string") return inner;
    if (Array.isArray(inner)) return coerceTranscriptText(inner);
  }
  return "";
}

/** Proxies audio to the backend, which calls Sarvam (key never in the browser). */
export async function inferVoiceRatingFromTranscript(
  transcript: string
): Promise<{ rating: number; sentiment: string }> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/infer-voice-rating`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not infer rating from voice");
  }
  return body as { rating: number; sentiment: string };
}

export async function transcribeVoiceRecording(
  audioBlob: Blob,
  filename = "recording.webm",
  languageCode: SpeechLanguageCode = "unknown"
): Promise<TranscribeSpeechResponse> {
  const formData = new FormData();
  formData.append("audio", audioBlob, filename);
  formData.append("model", "saaras:v3");
  formData.append("mode", "codemix");
  formData.append("language_code", languageCode);

  const response = await fetch(`${API_BASE_URL}/api/speech-to-text`, {
    method: "POST",
    body: formData,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not transcribe audio");
  }

  const row = body as Record<string, unknown>;
  const transcript = coerceTranscriptText(row.transcript);
  return {
    transcript,
    language_code: (row.language_code as string | null) ?? null,
    request_id: (row.request_id as string | null) ?? null,
  };
}
