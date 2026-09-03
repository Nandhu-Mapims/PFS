/**
 * Values that mean "no department / service" — stored and displayed as empty, not as a label.
 */
const EMPTY_LABEL =
  /^(nil|nill|null|n\/a|na|none|no|not applicable|not available|unknown|unspecified|-|\.|—|)$/i;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value) {
  return String(value).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (_full, ent) => {
    if (ent[0] === "#") {
      const code =
        ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, ent.toLowerCase())
      ? NAMED_ENTITIES[ent.toLowerCase()]
      : "";
  });
}

function stripHtmlTags(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/**
 * Extract visible patient-name text. Never executes markup or javascript: URLs.
 * Plain names (Mr./Mrs./Ms./Dr.) are returned unchanged aside from trim/whitespace collapse.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizePatientName(value) {
  if (value == null) return "";
  let s = String(value);
  if (!s) return "";
  s = stripHtmlTags(s);
  s = decodeHtmlEntities(s);
  s = stripHtmlTags(s);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * @param {string | null | undefined} value
 * @returns {string} trimmed value or "" when placeholder / meaningless
 */
export function sanitizeOptionalLabel(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (EMPTY_LABEL.test(s)) return "";
  return s;
}
