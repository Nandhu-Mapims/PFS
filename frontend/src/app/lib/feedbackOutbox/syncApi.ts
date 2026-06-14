import type { OutboxPayload } from "./types";

const API_BASE = "";

function readApiError(body: unknown): string {
  if (body && typeof body === "object" && "message" in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "";
}

function buildFeedbackFormData(payload: OutboxPayload, clientSubmissionId: string): FormData {
  const fd = new FormData();
  fd.append("clientSubmissionId", clientSubmissionId);
  fd.append("patientName", payload.patientName);
  if (payload.department) fd.append("department", payload.department);
  if (payload.lookupDepartment) fd.append("lookupDepartment", payload.lookupDepartment);
  if (payload.service) fd.append("service", payload.service);
  fd.append("rating", String(payload.rating));
  fd.append("comments", payload.comments ?? "");
  if (payload.source) fd.append("source", payload.source);
  fd.append("submissionMode", payload.submissionMode || "standard");
  if (payload.patientRegNo) fd.append("patientRegNo", payload.patientRegNo);
  if (payload.patientEncounterType) fd.append("patientEncounterType", payload.patientEncounterType);
  if (payload.ward) fd.append("ward", payload.ward);
  if (payload.ipNo) fd.append("ipNo", payload.ipNo);
  if (payload.visitOrAdmissionDate) fd.append("visitOrAdmissionDate", payload.visitOrAdmissionDate);
  return fd;
}

export async function postFeedbackText(
  payload: OutboxPayload,
  clientSubmissionId: string
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; message: string }> {
  const response = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    body: buildFeedbackFormData(payload, clientSubmissionId),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: readApiError(body) || "Could not save feedback",
    };
  }
  return { ok: true, body };
}

export async function postFeedbackVoice(
  serverFeedbackId: string,
  audioBlob: Blob
): Promise<{ ok: true } | { ok: false; status: number; message: string; permanent?: boolean }> {
  const fd = new FormData();
  const mime = audioBlob.type || "audio/webm";
  const ext = mime.includes("mp4") ? "m4a" : "webm";
  fd.append("voiceRecording", audioBlob, `voice-feedback.${ext}`);

  const response = await fetch(`${API_BASE}/api/feedback/${serverFeedbackId}/voice-recording`, {
    method: "POST",
    body: fd,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: readApiError(body) || "Voice upload failed",
      permanent: response.status === 413,
    };
  }
  return { ok: true };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
