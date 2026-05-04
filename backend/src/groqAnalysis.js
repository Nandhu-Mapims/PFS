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
