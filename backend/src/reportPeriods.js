/** Week/month bucket-key math shared by the summary-report scheduler, builder, and manual-generate endpoint. */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local-time Sunday-start week, matching frontend `startOfWeek`. */
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "YYYY-MM-DD" of the week's Sunday, matching frontend `bucketKeyForPeriod("weekly")`. */
export function weekKey(date) {
  const d = startOfWeek(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM", matching frontend `bucketKeyForPeriod("yearly")` (its monthly bucket format). */
export function monthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function currentPeriodKey(periodType, now = new Date()) {
  return periodType === "weekly" ? weekKey(now) : monthKey(now);
}

/** @returns {{ start: Date, end: Date } | null} null when periodKey doesn't match the expected format */
export function periodRangeForKey(periodType, periodKey) {
  if (periodType === "weekly") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return null;
    const start = new Date(`${periodKey}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setMilliseconds(-1);
    return { start, end };
  }

  if (!/^\d{4}-\d{2}$/.test(periodKey)) return null;
  const [y, m] = periodKey.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  end.setMilliseconds(-1);
  return { start, end };
}
