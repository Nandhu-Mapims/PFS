/**
 * TMS integration via HTTP API (Ticket Management System).
 * Configure TMS_API_BASE_URL to your TMS API root (e.g. https://tms.mapims.edu.in/api).
 * Optional shared secret: set TMS_INGEST_TOKEN and FEEDBACK_INGEST_TOKEN on TMS (must match).
 */

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

function getTmsApiBase() {
  const raw = String(process.env.TMS_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return raw;
}

function getIngestToken() {
  return String(process.env.TMS_INGEST_TOKEN || "").trim();
}

export function isTmsConfigured() {
  return Boolean(getTmsApiBase());
}

function ingestHeaders({ jsonBody } = {}) {
  const headers = { Accept: "application/json" };
  if (jsonBody) headers["Content-Type"] = "application/json";
  const token = getIngestToken();
  if (token) headers["X-Feedback-Ingest-Token"] = token;
  return headers;
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * TMS wraps JSON as { success, message, data, meta } from sendResponse.
 */
async function tmsFetch(path, options = {}) {
  const base = getTmsApiBase();
  if (!base) {
    throw new TmsError("TMS integration is not configured (set TMS_API_BASE_URL)", { status: 503 });
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const hasBody = options.body != null && options.body !== "";
  const method = String(options.method || "GET").toUpperCase();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...ingestHeaders({ jsonBody: hasBody }),
      ...(options.headers || {}),
    },
  });
  const payload = await parseJsonSafe(res);
  if (!res.ok) {
    const bodyPreview =
      typeof payload === "object" && payload
        ? JSON.stringify(payload).slice(0, 800)
        : String(payload).slice(0, 800);
    errLog("TMS HTTP error", {
      method,
      url,
      status: res.status,
      statusText: res.statusText,
      bodyPreview,
    });
    const msg =
      payload?.message ||
      payload?.error ||
      (typeof payload === "string" ? payload : res.statusText) ||
      "TMS request failed";
    throw new TmsError(msg, { status: res.status, body: payload });
  }
  return payload;
}

export async function createTicketForFeedback(feedback) {
  const plain =
    feedback && typeof feedback.toObject === "function"
      ? feedback.toObject()
      : { ...feedback };

  if (plain._id != null) plain._id = String(plain._id);

  log("createTicketForFeedback → POST /integrations/feedback/tickets", {
    feedbackId: plain._id || "(none)",
    rating: plain.rating,
    hasVoicePath: Boolean(plain.voiceRecordingRelPath),
    apiBase: getTmsApiBase(),
    ingestTokenSet: Boolean(getIngestToken()),
  });

  const wrapped = await tmsFetch("/integrations/feedback/tickets", {
    method: "POST",
    body: JSON.stringify({ feedback: plain }),
  });

  const data = wrapped?.data ?? wrapped;
  const id = data?.id ?? (data?._id != null ? String(data._id) : null);
  const ticketNumber = data?.ticketNumber ?? null;

  log("ticket created via TMS API", {
    feedbackId: plain._id || "",
    tmsTicketId: id,
    ticketNumber,
  });

  return {
    id,
    _id: id,
    ticketNumber,
    ...(typeof data === "object" && data ? data : {}),
  };
}

export async function patchTmsTicketFeedbackVoice(ticketIdStr, { feedbackVoiceRecordingRelPath, feedbackSourceId } = {}) {
  const idStr = String(ticketIdStr || "").trim();
  if (!idStr) return;

  log("patchTmsTicketFeedbackVoice → PATCH voice-meta", {
    tmsTicketId: idStr,
    feedbackVoiceRecordingRelPath,
    feedbackSourceId,
  });

  await tmsFetch(`/integrations/feedback/tickets/${encodeURIComponent(idStr)}/voice-meta`, {
    method: "PATCH",
    body: JSON.stringify({
      feedbackVoiceRecordingRelPath,
      feedbackSourceId,
    }),
  });
  log("patchTmsTicketFeedbackVoice ok", { tmsTicketId: idStr });
}

export async function getTmsHealth() {
  try {
    const payload = await tmsFetch("/integrations/feedback/health", { method: "GET" });
    const inner = payload?.data ?? payload;
    return { ok: true, status: 200, body: { ok: true, mode: "http", ...inner } };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof TmsError ? error.status : 502,
      body: { ok: false, message: error?.message || "TMS API unreachable" },
    };
  }
}

export async function listTmsDepartments() {
  const payload = await tmsFetch("/integrations/feedback/departments", { method: "GET" });
  const data = payload?.data ?? [];
  const meta = payload?.meta ?? { count: Array.isArray(data) ? data.length : 0 };
  return { data, meta };
}

/** Not exposed over public ingest API — kept for backward compatibility with older feedback routes. */
export async function getTmsTicket(_id) {
  throw new TmsError("Fetching TMS tickets by id requires the TMS web app or authenticated API", {
    status: 501,
  });
}

/** Not exposed over public ingest API. */
export async function listTmsTickets(_query = {}) {
  throw new TmsError("Listing TMS tickets requires the TMS web app or authenticated API", { status: 501 });
}

/** Surfaces a useful link for UIs to open the ticket directly in the TMS web app. */
export function buildTmsTicketUrl(ticketIdOrNumber) {
  const base = String(process.env.TMS_CLIENT_URL || "https://tms.mapims.edu.in")
    .trim()
    .replace(/\/+$/, "");
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
