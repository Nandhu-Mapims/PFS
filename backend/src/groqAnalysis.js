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
 * @param {{ patientName: string; department: string; rating: number; comments: string }} input
 * @param {{ feedbackId?: string }} [options]
 * @returns {Promise<{ sentiment: string; urgency: string; topics: string[]; summary: string } | null>}
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

  const userContent = `You are a healthcare feedback analyst. Analyze this hospital patient feedback.

Rating scale: 1 = very poor, 5 = excellent.
Patient name: ${String(input.patientName || "").slice(0, 120)}
Department: ${String(input.department || "unspecified").slice(0, 120)}
Numeric rating: ${input.rating}
Comments (may be empty): ${truncatedComments || "(none)"}

Respond with ONLY a valid JSON object (no markdown fences) using exactly these keys:
- "sentiment": one of "positive", "neutral", "negative" — infer from rating and comments together.
- "urgency": one of "low", "medium", "high" — service/safety follow-up urgency for staff.
- "topics": array of 1 to 5 short English strings (e.g. "wait time", "nursing care").
- "summary": one concise sentence for staff (max 220 characters).

Do not include any text outside the JSON object.`;

  // eslint-disable-next-line no-console
  console.log("[groq] request", {
    feedbackId,
    model,
    rating: input.rating,
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

  // eslint-disable-next-line no-console
  console.log("[groq] analysis complete", {
    feedbackId,
    sentiment: result.sentiment,
    urgency: result.urgency,
    topics: result.topics,
    summary: result.summary,
  });

  return result;
}
