/**
 * Normalizes Sarvam speech-to-text success and error payloads.
 */

/**
 * Best-effort extract plain transcript text (handles uncommon shapes / long clips).
 *
 * @param {unknown} data
 * @returns {string}
 */
export function extractSarvamTranscript(data) {
  if (!data || typeof data !== "object") return "";

  let t = data.transcript;

  if (typeof t === "string") return t;

  if (t && typeof t === "object") {
    const inner = t.text ?? t.content ?? t.value ?? t.utterance ?? t.transcript;
    if (typeof inner === "string") return inner;
  }

  const entries = data.diarized_transcript?.entries;
  if (Array.isArray(entries) && entries.length) {
    return entries
      .map((e) => (typeof e?.transcript === "string" ? e.transcript : ""))
      .join(" ")
      .trim();
  }

  const words = data.timestamps?.words;
  if (Array.isArray(words)) {
    return words.filter((w) => typeof w === "string").join(" ").trim();
  }

  return "";
}

/**
 * Human-readable API error message (never returns a raw object reference).
 *
 * @param {unknown} data Parsed JSON body
 * @returns {string}
 */
export function stringifySarvamError(data) {
  if (!data || typeof data !== "object") {
    return typeof data === "string" ? data.slice(0, 500) : "Transcription failed";
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim().slice(0, 600);
  }

  const nested = data.error;
  if (nested && typeof nested === "object" && typeof nested.message === "string" && nested.message.trim()) {
    return nested.message.trim().slice(0, 600);
  }

  if (typeof nested === "string" && nested.trim()) {
    return nested.trim().slice(0, 600);
  }

  if (typeof data.detail === "string" && data.detail.trim()) {
    return data.detail.trim().slice(0, 600);
  }

  try {
    const s = JSON.stringify(data);
    return s.length <= 700 ? s : `${s.slice(0, 700)}…`;
  } catch {
    return "Transcription failed";
  }
}
