export type PeriodGranularity = "daily" | "weekly" | "yearly";
export type TimeOfDaySlot = "all" | "morning" | "afternoon" | "evening" | "night";
export type CustomDateRange = { from: string; to: string };

export type FilterWindow = { start: Date; end: Date };

const TIME_SLOTS: Record<Exclude<TimeOfDaySlot, "all">, { label: string; start: number; end: number }> = {
  morning: { label: "Morning (6am–12pm)", start: 6, end: 12 },
  afternoon: { label: "Afternoon (12pm–6pm)", start: 12, end: 18 },
  evening: { label: "Evening (6pm–12am)", start: 18, end: 24 },
  night: { label: "Night (12am–6am)", start: 0, end: 6 },
};

export function parseDateOnly(value: string): Date | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function periodWindowStart(granularity: PeriodGranularity, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (granularity === "daily") {
    d.setDate(d.getDate() - 29);
  } else if (granularity === "weekly") {
    d.setDate(d.getDate() - 7 * 11);
  } else {
    d.setMonth(d.getMonth() - 11);
    d.setDate(1);
  }
  return d;
}

export function endOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Preset window, or custom from/to when both dates are valid. */
export function resolveFilterWindow(
  granularity: PeriodGranularity,
  customRange: Partial<CustomDateRange> | null | undefined,
  now = new Date()
): FilterWindow {
  const from = parseDateOnly(customRange?.from ?? "");
  const to = parseDateOnly(customRange?.to ?? "");
  if (from && to && from.getTime() <= to.getTime()) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return { start: from, end };
  }
  return { start: periodWindowStart(granularity, now), end: endOfToday(now) };
}

export function hasCustomDateRange(customRange: Partial<CustomDateRange> | null | undefined): boolean {
  const from = parseDateOnly(customRange?.from ?? "");
  const to = parseDateOnly(customRange?.to ?? "");
  return Boolean(from && to && from.getTime() <= to.getTime());
}

export function matchesTimeOfDay(date: Date, slot: TimeOfDaySlot): boolean {
  if (slot === "all") return true;
  const h = date.getHours();
  const { start, end } = TIME_SLOTS[slot];
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

export function timeSlotLabel(slot: TimeOfDaySlot): string {
  if (slot === "all") return "All times";
  return TIME_SLOTS[slot].label;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Calendar date in the user's local timezone (not UTC). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toDateInputValue(date: Date): string {
  return localDateKey(date);
}

export function thisWeekRange(now = new Date()): CustomDateRange {
  return { from: toDateInputValue(startOfWeek(now)), to: toDateInputValue(now) };
}

export function thisMonthRange(now = new Date()): CustomDateRange {
  return { from: toDateInputValue(startOfMonth(now)), to: toDateInputValue(now) };
}

export function last12WeeksRange(now = new Date()): CustomDateRange {
  const end = new Date(now);
  const start = periodWindowStart("weekly", now);
  return { from: toDateInputValue(start), to: toDateInputValue(end) };
}

export function last12MonthsRange(now = new Date()): CustomDateRange {
  const end = new Date(now);
  const start = periodWindowStart("yearly", now);
  return { from: toDateInputValue(start), to: toDateInputValue(end) };
}

export function last30DaysRange(now = new Date()): CustomDateRange {
  const end = new Date(now);
  const start = periodWindowStart("daily", now);
  return { from: toDateInputValue(start), to: toDateInputValue(end) };
}

export function rangesEqual(
  a: Partial<CustomDateRange> | null | undefined,
  b: CustomDateRange
): boolean {
  return String(a?.from ?? "").trim() === b.from && String(a?.to ?? "").trim() === b.to;
}

export function isDefaultPresetRange(
  granularity: PeriodGranularity,
  customRange: Partial<CustomDateRange> | null | undefined
): boolean {
  return !hasCustomDateRange(customRange);
}

export function bucketKeyForPeriod(date: Date, granularity: PeriodGranularity): string {
  if (granularity === "daily") {
    return localDateKey(date);
  }
  if (granularity === "weekly") {
    return localDateKey(startOfWeek(date));
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatBucketLabel(key: string, granularity: PeriodGranularity): string {
  if (granularity === "yearly") {
    const [y, m] = key.split("-");
    const month = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
    return month;
  }
  if (granularity === "weekly") {
    const d = new Date(`${key}T12:00:00`);
    return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDisplayDate(isoDate: string): string {
  const d = parseDateOnly(isoDate);
  if (!d) return isoDate;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function enumerateBucketKeys(granularity: PeriodGranularity, window: FilterWindow): string[] {
  const keys: string[] = [];
  if (granularity === "daily") {
    const cur = new Date(window.start);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(window.end);
    end.setHours(0, 0, 0, 0);
    while (cur.getTime() <= end.getTime()) {
      keys.push(localDateKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return keys;
  }
  if (granularity === "weekly") {
    let cur = startOfWeek(window.start);
    const end = startOfWeek(window.end);
    while (cur.getTime() <= end.getTime()) {
      keys.push(localDateKey(cur));
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
    return keys;
  }
  const cur = new Date(window.start.getFullYear(), window.start.getMonth(), 1);
  const end = new Date(window.end.getFullYear(), window.end.getMonth(), 1);
  while (cur.getTime() <= end.getTime()) {
    keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

export function filterItemsInWindow<T extends { createdAt: string }>(
  items: T[],
  window: FilterWindow,
  timeSlot: TimeOfDaySlot
): T[] {
  return items.filter((row) => {
    const d = new Date(row.createdAt);
    if (d < window.start || d > window.end) return false;
    return matchesTimeOfDay(d, timeSlot);
  });
}

/** Bot/voice sessions split into multiple tickets — count the parent row only for volume KPIs. */
export function feedbackRowsForAnalytics<T extends { isSplitChild?: boolean }>(items: T[]): T[] {
  return items.filter((row) => !row.isSplitChild);
}

/** Rows that opened a complaint ticket (includes split issue tickets). */
export function feedbackRowsWithTicket<T extends { ticketId?: string | null }>(items: T[]): T[] {
  return items.filter((row) => Boolean(String(row.ticketId || "").trim()));
}

export function buildStatusBuckets(
  items: { createdAt: string; status: string }[],
  granularity: PeriodGranularity,
  window: FilterWindow
): Array<{
  key: string;
  label: string;
  new: number;
  inProgress: number;
  resolved: number;
}> {
  const map = new Map<string, { new: number; inProgress: number; resolved: number }>();
  for (const row of items) {
    const key = bucketKeyForPeriod(new Date(row.createdAt), granularity);
    if (!map.has(key)) map.set(key, { new: 0, inProgress: 0, resolved: 0 });
    const entry = map.get(key)!;
    if (row.status === "In Progress") entry.inProgress += 1;
    else if (row.status === "Resolved") entry.resolved += 1;
    else entry.new += 1;
  }
  return enumerateBucketKeys(granularity, window).map((key) => {
    const counts = map.get(key) || { new: 0, inProgress: 0, resolved: 0 };
    return {
      key,
      label: formatBucketLabel(key, granularity),
      ...counts,
    };
  });
}

export function filterItemsByPeriodAndTime<T extends { createdAt: string }>(
  items: T[],
  granularity: PeriodGranularity,
  timeSlot: TimeOfDaySlot,
  customRange?: Partial<CustomDateRange> | null,
  now = new Date()
): T[] {
  const window = resolveFilterWindow(granularity, customRange, now);
  return filterItemsInWindow(items, window, timeSlot);
}

export function buildVolumeBuckets(
  items: { createdAt: string }[],
  granularity: PeriodGranularity,
  window: FilterWindow
): Array<{ key: string; label: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const row of items) {
    const key = bucketKeyForPeriod(new Date(row.createdAt), granularity);
    counts[key] = (counts[key] || 0) + 1;
  }
  return enumerateBucketKeys(granularity, window).map((key) => ({
    key,
    label: formatBucketLabel(key, granularity),
    count: counts[key] || 0,
  }));
}

export function buildSentimentBuckets<T extends { createdAt: string }>(
  items: T[],
  granularity: PeriodGranularity,
  window: FilterWindow,
  getBucket: (item: T) => "positive" | "neutral" | "negative" | null
): Array<{
  key: string;
  label: string;
  positive: number;
  neutral: number;
  negative: number;
}> {
  const map = new Map<string, { positive: number; neutral: number; negative: number }>();
  for (const row of items) {
    const key = bucketKeyForPeriod(new Date(row.createdAt), granularity);
    if (!map.has(key)) map.set(key, { positive: 0, neutral: 0, negative: 0 });
    const bucket = getBucket(row);
    const entry = map.get(key)!;
    if (bucket === "positive") entry.positive += 1;
    else if (bucket === "neutral") entry.neutral += 1;
    else if (bucket === "negative") entry.negative += 1;
  }
  return enumerateBucketKeys(granularity, window).map((key) => {
    const counts = map.get(key) || { positive: 0, neutral: 0, negative: 0 };
    return {
      key,
      label: formatBucketLabel(key, granularity),
      ...counts,
    };
  });
}

export function buildSubmissionsByHour(
  items: { createdAt: string }[]
): Array<{ label: string; hour: number; count: number }> {
  const counts = new Array(24).fill(0);
  for (const row of items) {
    counts[new Date(row.createdAt).getHours()] += 1;
  }
  return counts.map((count, hour) => ({
    hour,
    count,
    label:
      hour === 0
        ? "12am"
        : hour < 12
          ? `${hour}am`
          : hour === 12
            ? "12pm"
            : `${hour - 12}pm`,
  }));
}

export function periodDescription(
  granularity: PeriodGranularity,
  timeSlot: TimeOfDaySlot,
  customRange?: Partial<CustomDateRange> | null
): string {
  if (hasCustomDateRange(customRange)) {
    const time = timeSlot === "all" ? "" : ` · ${timeSlotLabel(timeSlot)}`;
    const bucket =
      granularity === "daily" ? "by day" : granularity === "weekly" ? "by week" : "by month";
    if (granularity === "weekly" && rangesEqual(customRange, thisWeekRange())) {
      return `This week (${bucket})${time}`;
    }
    if (granularity === "yearly" && rangesEqual(customRange, thisMonthRange())) {
      return `This month (${bucket})${time}`;
    }
    if (granularity === "weekly" && rangesEqual(customRange, last12WeeksRange())) {
      return `Last 12 weeks (${bucket})${time}`;
    }
    if (granularity === "yearly" && rangesEqual(customRange, last12MonthsRange())) {
      return `Last 12 months (${bucket})${time}`;
    }
    if (granularity === "daily" && rangesEqual(customRange, last30DaysRange())) {
      return `Last 30 days (${bucket})${time}`;
    }
    if (granularity === "daily" && rangesEqual(customRange, thisWeekRange())) {
      return `This week (${bucket})${time}`;
    }
    return `${formatDisplayDate(customRange!.from!)} – ${formatDisplayDate(customRange!.to!)} (${bucket})${time}`;
  }
  const window =
    granularity === "daily"
      ? "Last 30 days · by day"
      : granularity === "weekly"
        ? "Last 12 weeks · by week"
        : "Last 12 months · by month";
  const time = timeSlot === "all" ? "" : ` · ${timeSlotLabel(timeSlot)}`;
  return `${window}${time}`;
}

/** @deprecated Use last12WeeksRange */
export function defaultWeekCustomRange(now = new Date()): CustomDateRange {
  return last12WeeksRange(now);
}
