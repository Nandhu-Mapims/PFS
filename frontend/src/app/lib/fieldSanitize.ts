const EMPTY_LABEL =
  /^(nil|nill|null|n\/a|na|none|no|not applicable|not available|unknown|unspecified|-|\.|—|)$/i;

/** Treat nil-like EMR/form values as empty — do not chart or group as a fake department. */
export function sanitizeOptionalLabel(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (EMPTY_LABEL.test(s)) return "";
  return s;
}

/** Display helper: empty → em dash, never "Unspecified" / "Unknown". */
export function displayOptionalLabel(value: string | null | undefined): string {
  const s = sanitizeOptionalLabel(value);
  return s || "—";
}
