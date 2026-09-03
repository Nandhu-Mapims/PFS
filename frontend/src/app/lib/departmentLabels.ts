import { canonLabelKey } from "./hodRouting";

/**
 * EMR and AI both write department names free-form, so the same department
 * arrives as "GENERAL MEDICINE", "General Medicine" and "Housekeeping" /
 * "HOUSEKEEPING". Counting those separately splits a department across several
 * dashboard rows and understates its real volume.
 *
 * Grouping uses canonLabelKey, which collapses case, punctuation, British
 * spelling and plurals (PAEDIATRIC / PAEDIATRICS / Paediatric) while preserving
 * word count, so PAEDIATRIC DENTISTRY is never folded into PAEDIATRIC.
 */
export type LabelResolver = {
  /** Stable grouping key for a raw label. */
  keyOf: (raw: string | null | undefined) => string;
  /** Preferred display spelling for a raw label. */
  displayOf: (raw: string | null | undefined) => string;
};

/**
 * Build a resolver over the labels actually present. The winning spelling is the
 * most frequent one; `preferred` (e.g. catalog department names) wins outright.
 */
export function buildLabelResolver(
  rawLabels: Array<string | null | undefined>,
  preferred: Array<string | null | undefined> = []
): LabelResolver {
  const counts = new Map<string, Map<string, number>>();

  for (const raw of rawLabels) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const key = canonLabelKey(label);
    if (!key) continue;
    let spellings = counts.get(key);
    if (!spellings) {
      spellings = new Map<string, number>();
      counts.set(key, spellings);
    }
    spellings.set(label, (spellings.get(label) || 0) + 1);
  }

  const preferredByKey = new Map<string, string>();
  for (const name of preferred) {
    const label = String(name || "").trim();
    if (!label) continue;
    const key = canonLabelKey(label);
    if (key && !preferredByKey.has(key)) preferredByKey.set(key, label);
  }

  const display = new Map<string, string>();
  for (const [key, spellings] of counts) {
    const fromCatalog = preferredByKey.get(key);
    if (fromCatalog) {
      display.set(key, fromCatalog);
      continue;
    }
    const best = [...spellings.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0];
    display.set(key, best[0]);
  }

  const keyOf = (raw: string | null | undefined) => canonLabelKey(String(raw || "").trim());

  return {
    keyOf,
    displayOf: (raw) => {
      const label = String(raw || "").trim();
      const key = keyOf(label);
      return display.get(key) || label;
    },
  };
}
