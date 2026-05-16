/**
 * Extract tabular rows from EMR QueryBuilder JSON (`Getdataset1` → `d`).
 * Handles nested objects and stringified JSON payloads.
 */

function isPlainObjectRow(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isRowArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every(isPlainObjectRow);
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
export function extractObjectRows(data) {
  if (data == null) return [];
  let parsed = data;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  /** @type {Record<string, unknown>[][]} */
  const candidates = [];

  function collect(o, depth) {
    if (depth > 14 || o == null) return;
    if (Array.isArray(o)) {
      if (isRowArray(o)) candidates.push(o);
      for (const item of o) collect(item, depth + 1);
      return;
    }
    if (typeof o === "object") {
      for (const v of Object.values(o)) collect(v, depth + 1);
    }
  }

  collect(parsed, 0);
  if (!candidates.length) return [];

  const scored = candidates.map((rows) => {
    const row0 = rows[0] || {};
    const keyStr = Object.keys(row0).join(" ").toUpperCase();
    let score = rows.length * 10;
    if (keyStr.includes("REG")) score += 80;
    if (keyStr.includes("NAME")) score += 40;
    if (keyStr.includes("PATIENT")) score += 20;
    return { rows, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return /** @type {Record<string, unknown>[]} */ (scored[0].rows);
}
