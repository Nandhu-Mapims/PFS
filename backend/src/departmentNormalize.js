/**
 * Map free-text department input to a canonical Department.name from the DB when possible.
 * - Case-insensitive exact match to a department name
 * - Match abbreviations formed from initials of each word (e.g. "IT" → "Information Technology")
 */
function initialsFromName(name) {
  const parts = String(name)
    .split(/[\s\-&,/+]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

/**
 * Heuristic-only resolution — no AI.
 * @param {string | undefined | null} raw
 * @param {{ name: string }[]} departments
 * @returns {{ name: string, method: "empty" | "exact" | "initials" | "unmatched" }}
 */
export function resolveDepartmentHeuristic(raw, departments) {
  const s = String(raw ?? "").trim();
  if (!s) return { name: "", method: "empty" };

  const list = Array.isArray(departments) ? departments : [];

  const lower = s.toLowerCase();
  for (const d of list) {
    const name = String(d.name || "").trim();
    if (!name) continue;
    if (name.toLowerCase() === lower) return { name, method: "exact" };
  }

  const upperInput = s.toUpperCase();
  const matches = list.filter((d) => {
    const name = String(d.name || "").trim();
    if (!name) return false;
    return initialsFromName(name) === upperInput;
  });

  if (matches.length === 1) return { name: String(matches[0].name).trim(), method: "initials" };

  if (matches.length > 1) {
    matches.sort((a, b) =>
      String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" })
    );
    return { name: String(matches[0].name).trim(), method: "initials" };
  }

  return { name: s, method: "unmatched" };
}

/**
 * @param {string | undefined | null} raw
 * @param {{ name: string }[]} departments
 * @returns {string}
 */
export function normalizeDepartmentInput(raw, departments) {
  return resolveDepartmentHeuristic(raw, departments).name;
}
