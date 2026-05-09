/**
 * Groq OpenAI-compatible chat completions for patient-feedback analysis.
 * Requires GROQ_API_KEY in environment.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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

/**
 * @param {{ patientName: string; department: string; rating: number; comments: string }} input (rating is not sent to Groq; sentiment uses comments only)
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    // eslint-disable-next-line no-console
    console.log("[groq] infer voice rating skipped (GROQ_API_KEY not set)");
    return noop();
  }

  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  const truncated =
    textRaw.length > 4000 ? `${textRaw.slice(0, 4000)}…` : textRaw;

  const userContent = `You classify a single hospital patient's SPOKEN feedback (shown below as transcription text).

The transcript may be English, Tamil, or mixed — infer satisfaction only from wording and tone in the transcript.

Rating scale (exactly ONE integer):
- 5 = Excellent — strong praise, gratitude, "very happy", exceeded expectations.
- 4 = Good — generally positive experience, minor nuisances acceptable.
- 3 = Okay / neutral — mixed, vague, mostly factual without strong emotion, or ambiguous.
- 2 = Poor — clear complaints, frustration, disappointment, problems with care/service.
- 1 = Very Poor — rage, trauma, outrage, accusations of negligence/safety failures, vows to escalate.

sentiment MUST align coarsely:
- ratings 5–4 → sentiment "positive"
- rating 3 → sentiment "neutral"
- ratings 2–1 → sentiment "negative"

Rules:
- Do not consider anything outside this transcript.
- If text is meaningless noise or shorter than three meaningful words → use rating 3 and sentiment neutral.

Transcript:
"""

${truncated}

"""

Respond with ONLY valid JSON (no markdown): {"rating": <integer 1-5>, "sentiment": "positive"|"neutral"|"negative"}`;

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You reply only with a single JSON object. No markdown, no explanation.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 128,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error("[groq] infer voice rating HTTP error", {
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
    console.error("[groq] infer voice rating parse failed", {
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

export async function analyzePatientFeedback(input, options = {}) {
  const feedbackId = options.feedbackId ?? "unknown";

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    // eslint-disable-next-line no-console
    console.log("[groq] skipped (GROQ_API_KEY not set)");
    return null;
  }

  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

  const comments = String(input.comments || "").trim();
  const truncatedComments = comments.length > 4000 ? `${comments.slice(0, 4000)}…` : comments;

  const departmentChoices = Array.isArray(options.departmentChoices)
    ? options.departmentChoices.filter((c) => c && String(c.name || "").trim())
    : [];
  const deptProvided = Boolean(String(input.department || "").trim());
  const inferDepartment =
    !deptProvided && departmentChoices.length > 0;

  const departmentListBlock = inferDepartment
    ? `

Official departments (choose at most one for routing). Each line is "Name — description":
${departmentChoices
  .map((c) => `- ${String(c.name).trim()} — ${String(c.description || "").trim() || "general services"}`)
  .join("\n")}

Rules for "inferredDepartment":
- The patient did NOT specify a department. Infer the single best department from their comments (symptoms, procedures, staff roles, location clues).
- Set "inferredDepartment" to EXACTLY one "Name" string from the list above (character-for-character match to the name before " — "), or null if the text does not clearly fit any department.
- Do not invent department names.`
    : "";

  const sentimentDeptLine = deptProvided
    ? `Department (as entered by patient/staff): ${String(input.department || "").slice(0, 120)}`
    : `Department: not specified — use inferredDepartment field below only.`;

  // Sentiment must come from language in comments only — do not pass numeric ratings to the model
  // so it cannot anchor sentiment to stars. Ticket/rating rules remain server-side in index.js.
  const userContent = `You are a healthcare feedback analyst. Analyze this hospital patient feedback.

Patient name: ${String(input.patientName || "").slice(0, 120)}
${sentimentDeptLine}
Patient written comments (may be empty): ${truncatedComments || "(none)"}
${departmentListBlock}

Rules for the "sentiment" field:
- Infer sentiment ONLY from the wording and tone of the patient written comments (praise, complaints, frustration, gratitude).
- Do NOT infer sentiment from any numeric rating or score — you are not given one on purpose.
- If comments are empty or too vague to judge emotional tone, use "neutral".

Rules for "urgency": judge follow-up priority from the issues described in the comments (safety, repeated failures, severe distress), not from a star rating.

Respond with ONLY a valid JSON object (no markdown fences) using exactly these keys:
- "sentiment": one of "positive", "neutral", "negative" — from comment text only, as above.
- "urgency": one of "low", "medium", "high" — service/safety follow-up urgency for staff.
- "topics": array of 1 to 5 short English strings (e.g. "wait time", "nursing care").
- "summary": one concise sentence for staff (max 220 characters).${inferDepartment ? `\n- "inferredDepartment": either null or EXACTLY one department Name from the official list above.` : ""}

Do not include any text outside the JSON object.`;

  // eslint-disable-next-line no-console
  console.log("[groq] request", {
    feedbackId,
    model,
    department: String(input.department || "").slice(0, 80) || "(none)",
    commentChars: comments.length,
  });

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You reply only with a single JSON object. No markdown, no explanation.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.25,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error("[groq] HTTP error", {
      feedbackId,
      status: response.status,
      bodyPreview: errText.slice(0, 400),
    });
    throw new Error(`Groq HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    // eslint-disable-next-line no-console
    console.error("[groq] empty completion", { feedbackId, model });
    throw new Error("Empty Groq completion");
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    // eslint-disable-next-line no-console
    console.error("[groq] parse JSON failed", {
      feedbackId,
      rawPreview: raw.slice(0, 500),
    });
    throw new Error("Groq returned non-JSON");
  }

  const topics = Array.isArray(parsed.topics)
    ? parsed.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
    : [];

  const result = {
    sentiment: normalizeSentiment(parsed.sentiment),
    urgency: normalizeUrgency(parsed.urgency),
    topics,
    summary: String(parsed.summary || "")
      .trim()
      .slice(0, 300),
  };

  let inferredDepartment = null;
  if (inferDepartment) {
    inferredDepartment = resolveDepartmentFromAi(parsed.inferredDepartment, departmentChoices);
  }

  // eslint-disable-next-line no-console
  console.log("[groq] analysis complete", {
    feedbackId,
    sentiment: result.sentiment,
    urgency: result.urgency,
    topics: result.topics,
    summary: result.summary,
    inferredDepartment: inferDepartment ? inferredDepartment : undefined,
  });

  return inferDepartment ? { ...result, inferredDepartment } : result;
}

/**
 * Map a free-text department hint (possibly informal) to exactly one canonical name from choices.
 * Used when heuristic rules did not match. Returns null if no clear fit or on API/key failure.
 *
 * @param {string | null | undefined} userHint
 * @param {{ name: string; description?: string }[]} departmentChoices
 * @returns {Promise<string | null>}
 */
export async function resolveDepartmentHintWithGroq(userHint, departmentChoices) {
  const apiKey = process.env.GROQ_API_KEY;
  const hint = String(userHint ?? "").trim();
  if (!apiKey || !String(apiKey).trim() || !hint) return null;

  const choices = Array.isArray(departmentChoices)
    ? departmentChoices.filter((c) => c && String(c.name || "").trim())
    : [];
  if (!choices.length) return null;

  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  const listBlock = choices
    .map(
      (c) =>
        `- ${String(c.name).trim()} — ${String(c.description || "").trim() || "general services"}`
    )
    .join("\n");

  const userContent = `A staff member or patient typed this optional "department" field on a hospital feedback form:
"${hint.slice(0, 200)}"

Official departments (you may pick at most one EXACT Name from the list — the part before " — " on each line):
${listBlock}

Rules:
- Choose the single Name that best matches their hint (synonyms, informal names, common typos, local abbreviations).
- If the hint does not clearly correspond to any one department, use null.
- Never invent a department name that is not in the list.

Respond with ONLY valid JSON (no markdown): {"matchedDepartment": "<exact Name from list>" | null}`;

  // eslint-disable-next-line no-console
  console.log("[groq] department-hint resolve", {
    hintPreview: hint.slice(0, 80),
    model,
    choices: choices.length,
  });

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You reply only with a single JSON object. No markdown, no explanation.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.15,
      max_tokens: 128,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error("[groq] department-hint HTTP error", {
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
    console.error("[groq] department-hint parse failed", { rawPreview: raw.slice(0, 200) });
    return null;
  }

  const resolved = resolveDepartmentFromAi(parsed.matchedDepartment, choices);
  // eslint-disable-next-line no-console
  console.log("[groq] department-hint result", {
    matchedDepartment: resolved,
  });
  return resolved;
}
