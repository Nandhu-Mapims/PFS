export interface FeedbackPayload {
  patientName: string;
  department?: string;
  rating: number;
  comments: string;
  source?: "patient" | "staff" | "ai";
  /** When set, multipart upload stores audio under this feedback (voice flow). */
  voiceRecording?: Blob | null;
}

export interface BrandingSettings {
  primaryColor: string;
  pageBackgroundColor: string;
  logoDataUrl: string | null;
}

export interface CreateFeedbackResponse extends FeedbackItem {
  ticketRaised?: boolean;
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
  tmsTicketId?: string | null;
  tmsTicketNumber?: string | null;
  tmsTicketUrl?: string | null;
  tmsSyncedAt?: string | null;
  tmsSyncError?: string | null;
  voiceRecordingRelPath?: string | null;
  voiceRecordingUrl?: string | null;
}

export interface FeedbackAnalytics {
  totals: {
    all: number;
    negative: number;
    aiTickets: number;
    averageRating: number;
  };
  byStatus: Array<{ status: FeedbackItem["status"]; count: number }>;
  negativeByDepartment: Array<{ department: string; count: number }>;
  submissionsByDay: Array<{ day: string; count: number }>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export async function createFeedback(payload: FeedbackPayload): Promise<CreateFeedbackResponse> {
  const { voiceRecording, ...fields } = payload;
  let response: Response;

  if (voiceRecording && voiceRecording.size > 0) {
    const fd = new FormData();
    fd.append("patientName", fields.patientName);
    if (fields.department != null && fields.department !== "") {
      fd.append("department", fields.department);
    }
    fd.append("rating", String(fields.rating));
    fd.append("comments", fields.comments ?? "");
    if (fields.source) fd.append("source", fields.source);
    const mime = voiceRecording.type || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : "webm";
    fd.append("voiceRecording", voiceRecording, `voice-feedback.${ext}`);

    response = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: "POST",
      body: fd,
    });
  } else {
    response = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const b = body as { message?: string; detail?: string; hint?: string };
    const msg =
      typeof b?.message === "string" && b.message.trim()
        ? b.message.trim()
        : "Could not save feedback";
    const detail = typeof b?.detail === "string" && b.detail.trim() ? `\n${b.detail.trim()}` : "";
    const hint = typeof b?.hint === "string" && b.hint.trim() ? `\n${b.hint.trim()}` : "";
    throw new Error(`${msg}${detail}${hint}`.trim());
  }

  return body as CreateFeedbackResponse;
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
  const rows = await getFeedback();
  const item = rows.find((row) => row._id === id || row.ticketId === id);
  if (!item) {
    throw new Error("Ticket not found");
  }
  return item;
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

export interface Department {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export async function getDepartments(): Promise<Department[]> {
  const response = await fetch(`${API_BASE_URL}/api/departments`);
  if (!response.ok) throw new Error("Could not load departments");
  return response.json();
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

export type SpeechLanguageCode = "unknown" | "en-IN" | "ta-IN" | "te-IN" | "kn-IN";

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

// ---------------------------------------------------------------------------
// TMS (Ticket Management System) integration — proxied via this backend so the
// browser never sees TMS service-account credentials.
// ---------------------------------------------------------------------------

export interface TmsHealth {
  configured: boolean;
  reachable?: boolean;
  status?: number;
  message?: string;
  tms?: unknown;
}

export interface TmsDepartment {
  _id?: string;
  id?: string;
  name?: string;
  code?: string;
  isActive?: boolean;
}

export interface TmsTicket {
  _id?: string;
  id?: string;
  ticketNumber?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export async function getTmsHealth(): Promise<TmsHealth> {
  const response = await fetch(`${API_BASE_URL}/api/tms/health`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  return body as TmsHealth;
}

export async function getTmsDepartments(): Promise<{ data: TmsDepartment[]; meta?: unknown }> {
  const response = await fetch(`${API_BASE_URL}/api/tms/departments`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not load TMS departments");
  }
  return body as { data: TmsDepartment[]; meta?: unknown };
}

export async function getTmsTicket(idOrNumber: string): Promise<TmsTicket> {
  const response = await fetch(
    `${API_BASE_URL}/api/tms/tickets/${encodeURIComponent(idOrNumber)}`,
    { cache: "no-store" }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not load TMS ticket");
  }
  return body as TmsTicket;
}

export async function syncFeedbackToTms(
  feedbackIdOrTicketId: string
): Promise<{ ok: boolean; feedback: FeedbackItem }> {
  const response = await fetch(
    `${API_BASE_URL}/api/tms/tickets/sync/${encodeURIComponent(feedbackIdOrTicketId)}`,
    { method: "POST" }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readApiErrorMessage(body) || "Could not sync ticket to TMS");
  }
  return body as { ok: boolean; feedback: FeedbackItem };
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
