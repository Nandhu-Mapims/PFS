/** Helpers for deriving UI colors from admin primary hex (#RRGGBB). */

function normalizeHex(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, "");
  if (/^[a-f\d]{6}$/i.test(raw)) return `#${raw}`.toLowerCase();
  if (/^[a-f\d]{3}$/i.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  return null;
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

/** Blend RGB toward black (fraction 0–1 adds more black). */
export function mixWithBlack(hex: string, fraction: number): string {
  const rgb = parseRgb(hex);
  if (!rgb) return hex;
  const f = Math.min(1, Math.max(0, fraction));
  const r = Math.round(rgb.r * (1 - f));
  const g = Math.round(rgb.g * (1 - f));
  const b = Math.round(rgb.b * (1 - f));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Blend RGB toward white. */
export function mixWithWhite(hex: string, fraction: number): string {
  const rgb = parseRgb(hex);
  if (!rgb) return hex;
  const f = Math.min(1, Math.max(0, fraction));
  const r = Math.round(rgb.r + (255 - rgb.r) * f);
  const g = Math.round(rgb.g + (255 - rgb.g) * f);
  const b = Math.round(rgb.b + (255 - rgb.b) * f);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Appends AA (0–255) for CSS colors with alpha without rgba(). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const n = normalizeHex(hex);
  if (!n) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  const aa = a.toString(16).padStart(2, "0");
  return `${n}${aa}`;
}
