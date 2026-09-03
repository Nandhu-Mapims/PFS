/**
 * Shared chart colour tokens, validated against the CVD/lightness/chroma/contrast
 * checks in the dataviz skill's palette validator (all PASS, both light and dark
 * surfaces — the app itself only renders light, so light-mode hex is used as-is).
 * The previous per-file DEPT_COLORS / TOPIC_COLORS arrays failed that validation:
 * one hue read as grey (chroma below floor), one sat outside the lightness band,
 * and two contrasted under 3:1 against the card surface.
 */

/** Fixed eight-hue categorical order. Never cycle past this — fold the tail into "Other". */
export const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
] as const;

/**
 * Sentiment is a state, not an identity, so it draws from the reserved status
 * palette (good / critical) plus a deliberately unsaturated neutral — never
 * from the categorical hues above.
 */
export const SENTIMENT_COLORS = {
  positive: "#0ca30c",
  neutral: "#78838d",
  negative: "#d03b3b",
} as const;

/**
 * Stable colour per entity name — the same department keeps the same colour
 * across re-sorts and filter changes, because the hash is keyed to the name
 * itself rather than to its position in whatever array is currently on screen.
 * Beyond the 8 fixed hues, names deterministically repeat a hue rather than
 * generating a new one — callers with unbounded cardinality should group the
 * tail into "Other" instead of relying on this to invent distinct colours.
 */
export function colorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CATEGORICAL_PALETTE[hash % CATEGORICAL_PALETTE.length];
}

/**
 * Colour assignment for a chart whose entire, bounded category set renders at
 * once (a ranked top-N list, a single stacked bar) — every key present gets a
 * distinct hue up to the 8-slot cap, instead of colorForKey's independent hash
 * per key, which can send several keys to the same slot even though there was
 * a free one available. Each key still prefers its own colorForKey hash first
 * (so the common case — the same theme keeps the same colour week to week —
 * holds), and only falls through to the next free slot when that preferred
 * slot is already taken within this call's key list. Beyond 8 keys, the
 * (9+)th key repeats a slot rather than inventing a 9th hue — group the tail
 * into "Other" if the source list can grow past 8.
 */
export function colorsForKeys(keys: string[]): Record<string, string> {
  const used = new Set<number>();
  const result: Record<string, string> = {};
  for (const key of keys) {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    let slot = hash % CATEGORICAL_PALETTE.length;
    let probes = 0;
    while (used.has(slot) && probes < CATEGORICAL_PALETTE.length) {
      slot = (slot + 1) % CATEGORICAL_PALETTE.length;
      probes += 1;
    }
    used.add(slot);
    result[key] = CATEGORICAL_PALETTE[slot];
  }
  return result;
}

/**
 * Ordinal ramp (single hue, monotone lightness) for a bucketed sequence where
 * order carries meaning — e.g. a backlog-age histogram, where darker = older.
 * Never use this for unordered identity (that's CATEGORICAL_PALETTE); never
 * cycle it past 4 steps without re-validating with `--ordinal`.
 */
export const ORDINAL_BLUE = ["#86b6ef", "#3987e5", "#1c5cab", "#0d366b"] as const;

/**
 * Ticket workflow status is a state, not an identity, so — like sentiment —
 * it never draws from CATEGORICAL_PALETTE. "In Progress" and "Resolved" take
 * the reserved status warning/good steps; "New" has no reserved status
 * meaning of its own (it isn't good or bad, just untouched) so it takes the
 * categorical blue used as an informational colour elsewhere in this app's
 * UI, not the workflow-status track. Keep in sync with SENTIMENT_COLORS.positive.
 */
export const STATUS_COLORS = {
  new: "#2a78d6",
  inProgress: "#fab219",
  resolved: "#0ca30c",
} as const;
