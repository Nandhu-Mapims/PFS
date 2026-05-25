import { sanitizeOptionalLabel } from "./fieldSanitize.js";
import { filterAiTopicsForTranscript } from "./aiTopicsFilter.js";
import {
  SYSTEM_JSON_ONLY,
  buildFeedbackAnalysisUserPrompt,
  buildServiceHintResolveUserPrompt,
  buildVoiceRatingUserPrompt,
} from "./openRouterPrompts.js";

/**
 * OpenRouter OpenAI-compatible chat completions for patient-feedback analysis.
 * Requires OPENROUTER_API_KEY in environment.
 * @see https://openrouter.ai/docs/api/reference/overview
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

function openRouterHeaders(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title =
    process.env.OPENROUTER_APP_TITLE?.trim() || "MAPIMS Feedback System";
  if (referer) headers["HTTP-Referer"] = referer;
  headers["X-Title"] = title;
  return headers;
}

function getApiKey() {
  return process.env.OPENROUTER_API_KEY?.trim() || "";
}

function getModel() {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

function normalizeSentiment(value) {
  const v = String(value || "").toLowerCase();
  if (["positive", "neutral", "negative"].includes(v)) return v;
  return "neutral";
}

function normalizeUrgency(value) {
  const v = String(value || "").toLowerCase();
  if (["low", "medium", "high"].includes(v)) return v;
  return "medium";
}

function stripJsonFence(text) {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```$/i, "");
  }
  return t.trim();
}

/**
 * @param {string | null | undefined} raw
 * @param {{ name: string; description?: string }[]} choices
 * @returns {string | null} canonical department name from DB or null
 */
export function resolveDepartmentFromAi(raw, choices) {
  if (raw == null || !choices?.length) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const exact = choices.find((c) => c.name.toLowerCase() === lower);
  return exact ? exact.name : null;
}

/** Alias — TMS catalog entries are exposed as hospital "services" in the feedback UI. */
export const resolveServiceFromAi = resolveDepartmentFromAi;

/**
 * @param {{ patientName: string; department: string; rating: number; comments: string }} input (rating is not sent to the model; sentiment uses comments only)
 * @param {{ feedbackId?: string; departmentChoices?: { name: string; description?: string }[] }} [options]
 * @returns {Promise<{ sentiment: string; urgency: string; topics: string[]; summary: string; inferredDepartment?: string | null } | null>}
 */
/**
 * Map a voice transcript (Tamil / English / mixed) to rating 1–5 and coarse sentiment for the emoji scale.
 *
 * @param {string | null | undefined} transcript
 * @returns {Promise<{ rating: number; sentiment: string }>}
 */
export async function inferRatingFromVoiceTranscript(transcript) {
  const textRaw = String(transcript || "").trim();
  const noop = () => ({ rating: 3, sentiment: "neutral" });
  const shortNoContent =
    !textRaw ||
    /^\(No speech detected\.\)$/i.test(textRaw) ||
    textRaw.toLowerCase() === "no speech detected";

  if (shortNoContent) {
    return noop();
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(
      "[openrouter] infer voice rating skipped (OPENROUTER_API_KEY not set)"
    );
    return noop();
  }

  const model = getModel();
  const truncated =
    textRaw.length > 4000 ? `${textRaw.slice(0, 4000)}…` : textRaw;

  const userContent = buildVoiceRatingUserPrompt(truncated);

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_JSON_ONLY },
        { role: "user", content: userContent },
      ],
      temperature: 0.15,
      max_tokens: 128,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error("[openrouter] infer voice rating HTTP error", {
      status: response.status,
      bodyPreview: errText.slice(0, 400),
    });
    return noop();
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return noop();
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    // eslint-disable-next-line no-console
    console.error("[openrouter] infer voice rating parse failed", {
      rawPreview: raw.slice(0, 300),
    });
    return noop();
  }

  const r = Number(parsed.rating);
  const bounded = Number.isFinite(r)
    ? Math.min(5, Math.max(1, Math.round(r)))
    : 3;

  let sentiment;
  if (bounded >= 4) sentiment = "positive";
  else if (bounded === 3) sentiment = "neutral";
  else sentiment = "negative";

  return { rating: bounded, sentiment };
}

function normalizeIssueFromAi(raw, serviceChoices, emrDepartment) {
  const emrDept = sanitizeOptionalLabel(emrDepartment);
  const inferredDept = sanitizeOptionalLabel(raw?.department);
  const dept = (inferredDept || emrDept).slice(0, 120);
  const svcRaw = sanitizeOptionalLabel(raw?.recommendedService);
  const svc = resolveServiceFromAi(svcRaw, serviceChoices) || "";
  return {
    department: dept,
    recommendedService: svc,
    issueSummary: String(raw?.issueSummary || "").trim().slice(0, 500),
    suggestedAction: String(raw?.suggestedAction || "").trim().slice(0, 500),
    sentiment: normalizeSentiment(raw?.sentiment),
  };
}

export async function analyzePatientFeedback(input, options = {}) {
  const feedbackId = options.feedbackId ?? "unknown";

  const apiKey = getApiKey();
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log("[openrouter] skipped (OPENROUTER_API_KEY not set)");
    return null;
  }

  const model = getModel();

  const comments = String(input.comments || "").trim();
  const truncatedComments =
    comments.length > 4000 ? `${comments.slice(0, 4000)}…` : comments;

  const emrDepartment = sanitizeOptionalLabel(
    input.patientDepartment || input.department
  );
  const serviceHint = sanitizeOptionalLabel(input.service);
  const serviceChoices = Array.isArray(options.serviceChoices || options.departmentChoices)
    ? (options.serviceChoices || options.departmentChoices).filter(
        (c) => c && String(c.name || "").trim()
      )
    : [];

  const userContent = buildFeedbackAnalysisUserPrompt({
    patientName: String(input.patientName || "").slice(0, 120),
    emrDepartment: emrDepartment.slice(0, 120),
    serviceHint: serviceHint.slice(0, 120),
    comments: truncatedComments,
    serviceChoices: serviceChoices.map((c) => ({
      name: String(c.name).trim(),
      description: String(c.description || "").trim(),
    })),
  });

  // eslint-disable-next-line no-console
  console.log("[openrouter] request", {
    feedbackId,
    model,
    patientDepartment: emrDepartment.slice(0, 80) || "(none)",
    serviceHint: serviceHint.slice(0, 80) || "(none)",
    commentChars: comments.length,
  });

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_JSON_ONLY },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error("[openrouter] HTTP error", {
      feedbackId,
      status: response.status,
      bodyPreview: errText.slice(0, 400),
    });
    throw new Error(
      `OpenRouter HTTP ${response.status}: ${errText.slice(0, 500)}`
    );
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    // eslint-disable-next-line no-console
    console.error("[openrouter] empty completion", { feedbackId, model });
    throw new Error("Empty OpenRouter completion");
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    // eslint-disable-next-line no-console
    console.error("[openrouter] parse JSON failed", {
      feedbackId,
      rawPreview: raw.slice(0, 500),
    });
    throw new Error("OpenRouter returned non-JSON");
  }

  const topics = Array.isArray(parsed.topics)
    ? parsed.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
    : [];

  const primaryService =
    resolveServiceFromAi(parsed.recommendedService, serviceChoices) ||
    (serviceHint ? resolveServiceFromAi(serviceHint, serviceChoices) : null) ||
    "";

  let issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .map((row) => normalizeIssueFromAi(row, serviceChoices, emrDepartment))
        .filter((row) => row.issueSummary || row.department || row.recommendedService)
    : [];

  if (issues.length === 0) {
    issues = [
      normalizeIssueFromAi(
        {
          department: emrDepartment,
          recommendedService: primaryService,
          issueSummary: String(parsed.summary || "").trim(),
          suggestedAction:
            parsed.suggestedAction ||
            "Review feedback and assign appropriate service owner.",
        },
        serviceChoices,
        emrDepartment
      ),
    ];
  }

  const filteredTopics = filterAiTopicsForTranscript(topics, comments);

  const result = {
    sentiment: normalizeSentiment(parsed.sentiment),
    urgency: normalizeUrgency(parsed.urgency),
    topics: filteredTopics,
    summary: String(parsed.summary || "")
      .trim()
      .slice(0, 300),
    recommendedService: primaryService || issues[0]?.recommendedService || "",
    issues,
    /** @deprecated use recommendedService — kept for callers not yet migrated */
    inferredDepartment: primaryService || null,
  };

  // eslint-disable-next-line no-console
  console.log("[openrouter] analysis complete", {
    feedbackId,
    sentiment: result.sentiment,
    urgency: result.urgency,
    topics: result.topics,
    summary: result.summary,
    recommendedService: result.recommendedService,
    issueCount: issues.length,
  });

  return result;
}

/**
 * Map a free-text department hint (possibly informal) to exactly one canonical name from choices.
 * Used when heuristic rules did not match. Returns null if no clear fit or on API/key failure.
 *
 * @param {string | null | undefined} userHint
 * @param {{ name: string; description?: string }[]} departmentChoices
 * @returns {Promise<string | null>}
 */
export async function resolveServiceHintWithOpenRouter(userHint, serviceChoices) {
  return resolveDepartmentHintWithOpenRouter(userHint, serviceChoices);
}

export async function resolveDepartmentHintWithOpenRouter(
  userHint,
  departmentChoices
) {
  const apiKey = getApiKey();
  const hint = String(userHint ?? "").trim();
  if (!apiKey || !hint) return null;

  const choices = Array.isArray(departmentChoices)
    ? departmentChoices.filter((c) => c && String(c.name || "").trim())
    : [];
  if (!choices.length) return null;

  const model = getModel();
  const userContent = buildServiceHintResolveUserPrompt(
    hint.slice(0, 200),
    choices.map((c) => ({
      name: String(c.name).trim(),
      description: String(c.description || "").trim(),
    }))
  );

  // eslint-disable-next-line no-console
  console.log("[openrouter] department-hint resolve", {
    hintPreview: hint.slice(0, 80),
    model,
    choices: choices.length,
  });

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_JSON_ONLY },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 128,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error("[openrouter] department-hint HTTP error", {
      status: response.status,
      bodyPreview: errText.slice(0, 400),
    });
    return null;
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    // eslint-disable-next-line no-console
    console.error("[openrouter] department-hint parse failed", {
      rawPreview: raw.slice(0, 200),
    });
    return null;
  }

  const resolved = resolveDepartmentFromAi(parsed.matchedDepartment, choices);
  // eslint-disable-next-line no-console
  console.log("[openrouter] department-hint result", {
    matchedDepartment: resolved,
  });
  return resolved;
}
