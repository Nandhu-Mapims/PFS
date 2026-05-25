/**
 * Values that mean "no department / service" — stored and displayed as empty, not as a label.
 */
const EMPTY_LABEL =
  /^(nil|nill|null|n\/a|na|none|no|not applicable|not available|unknown|unspecified|-|\.|—|)$/i;

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
