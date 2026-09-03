import type { Department, FeedbackItem, UserRow } from "./api";
import { buildLabelResolver } from "./departmentLabels";
import { sanitizeOptionalLabel } from "./fieldSanitize";
import { labelsMatch, userHodDepartmentNames } from "./hodRouting";
import { ticketDepartment } from "./ticketFilters";

export type ScorecardRow = {
  department: string;
  /** HOD accountable for this department, or "" when none is mapped. */
  hod: string;
  /** True when the HOD name came from ticket assignments, not the catalog map. */
  hodFromAssignment: boolean;
  total: number;
  open: number;
  closed: number;
  /** Closed / total, 0-100. */
  closeRate: number;
  /** Closed tickets carrying a structured CAPA. */
  capaWritten: number;
  /** capaWritten / closed, 0-100. Null when nothing is closed yet. */
  capaCoverage: number | null;
};

/** A closed ticket counts as documented only once a CAPA has actually been written. */
export function hasCapa(row: FeedbackItem): boolean {
  return Boolean(row.capa?.writtenAt);
}

export function isClosed(row: FeedbackItem): boolean {
  return row.status === "Resolved";
}

function hodForDepartment(
  departmentName: string,
  departments: Department[],
  hodUsers: UserRow[]
): string {
  const catalog = departments.find((d) => labelsMatch(d.name, departmentName));
  if (catalog?.hodUserId?.username) return catalog.hodUserId.username;

  const mapped = hodUsers.find((u) =>
    userHodDepartmentNames(u).some((name) => labelsMatch(name, departmentName))
  );
  return mapped?.username || "";
}

/**
 * Department-wise ticket performance with the accountable HOD.
 *
 * Tickets are grouped by the department they belong to (not by assignee) so a
 * department with an unassigned backlog still shows up — otherwise the worst
 * performers would silently vanish from the table.
 */
export function buildDepartmentScorecard(
  ticketRows: FeedbackItem[],
  departments: Department[],
  users: UserRow[]
): ScorecardRow[] {
  const hodUsers = users.filter((u) => u.role === "hod");

  const rawLabels = ticketRows.map(
    (row) => sanitizeOptionalLabel(ticketDepartment(row)) || "Unassigned department"
  );
  // Catalog spelling wins, so the scorecard reads the same as the departments page.
  const labels = buildLabelResolver(
    rawLabels,
    departments.map((d) => d.name)
  );

  const byDept = new Map<
    string,
    {
      display: string;
      total: number;
      closed: number;
      capaWritten: number;
      assignees: Map<string, number>;
    }
  >();

  for (const row of ticketRows) {
    const raw = sanitizeOptionalLabel(ticketDepartment(row)) || "Unassigned department";
    const key = labels.keyOf(raw) || raw;
    let entry = byDept.get(key);
    if (!entry) {
      entry = {
        display: labels.displayOf(raw),
        total: 0,
        closed: 0,
        capaWritten: 0,
        assignees: new Map<string, number>(),
      };
      byDept.set(key, entry);
    }
    entry.total += 1;
    if (isClosed(row)) {
      entry.closed += 1;
      if (hasCapa(row)) entry.capaWritten += 1;
    }
    const assignee = String(row.assignedToUsername || "").trim();
    if (assignee) entry.assignees.set(assignee, (entry.assignees.get(assignee) || 0) + 1);
  }

  return [...byDept.values()].map((e) => {
    const department = e.display;
    let hod = hodForDepartment(department, departments, hodUsers);
    let hodFromAssignment = false;

    if (!hod && e.assignees.size) {
      // No catalog mapping — fall back to whoever actually holds the tickets.
      hod = [...e.assignees.entries()].sort((a, b) => b[1] - a[1])[0][0];
      hodFromAssignment = true;
    }

    return {
      department,
      hod,
      hodFromAssignment,
      total: e.total,
      open: e.total - e.closed,
      closed: e.closed,
      closeRate: e.total ? Math.round((e.closed / e.total) * 1000) / 10 : 0,
      capaWritten: e.capaWritten,
      capaCoverage: e.closed ? Math.round((e.capaWritten / e.closed) * 1000) / 10 : null,
    };
  });
}

export type ScorecardSort = "volume" | "closeRate";

export function sortScorecard(rows: ScorecardRow[], sort: ScorecardSort): ScorecardRow[] {
  const copy = [...rows];
  if (sort === "closeRate") {
    // Worst performers first, but only among departments that actually have tickets.
    return copy.sort((a, b) => a.closeRate - b.closeRate || b.total - a.total);
  }
  return copy.sort((a, b) => b.total - a.total || a.department.localeCompare(b.department));
}

export type ScorecardTotals = {
  total: number;
  open: number;
  closed: number;
  closeRate: number;
  capaWritten: number;
  capaCoverage: number | null;
  departments: number;
};

export function scorecardTotals(rows: ScorecardRow[]): ScorecardTotals {
  const total = rows.reduce((n, r) => n + r.total, 0);
  const closed = rows.reduce((n, r) => n + r.closed, 0);
  const capaWritten = rows.reduce((n, r) => n + r.capaWritten, 0);
  return {
    total,
    open: total - closed,
    closed,
    closeRate: total ? Math.round((closed / total) * 1000) / 10 : 0,
    capaWritten,
    capaCoverage: closed ? Math.round((capaWritten / closed) * 1000) / 10 : null,
    departments: rows.length,
  };
}

function median(hours: number[]): number | null {
  if (!hours.length) return null;
  const sorted = [...hours].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p90(hours: number[]): number | null {
  if (!hours.length) return null;
  const sorted = [...hours].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1);
  return sorted[idx];
}

/** Formats a duration in hours as e.g. "3.2h" under a day, else "5.1d". */
export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export type BacklogBucket = { label: string; count: number };

export type TimingMetrics = {
  totalCount: number;
  assignedCount: number;
  medianHoursToAssign: number | null;
  p90HoursToAssign: number | null;
  resolvedCount: number;
  medianHoursToResolve: number | null;
  p90HoursToResolve: number | null;
  openCount: number;
  backlogBuckets: BacklogBucket[];
};

const BACKLOG_BUCKET_BOUNDS: { label: string; maxDays: number }[] = [
  { label: "0–7 days", maxDays: 7 },
  { label: "8–30 days", maxDays: 30 },
  { label: "31–90 days", maxDays: 90 },
  { label: "90+ days", maxDays: Infinity },
];

/**
 * Time-to-assign and time-to-resolve, measured from the timestamps already on
 * every ticket (`createdAt` -> `assignedAt` -> `resolutionNoteAt`) — no schema
 * change needed. Median is reported rather than mean because both durations
 * are heavily right-skewed (a handful of very old backlog tickets would
 * otherwise dominate the average); p90 is included so a viewer can see the
 * long tail median hides. Backlog age buckets only the currently-open tickets
 * (status !== "Resolved"), by age since submission.
 */
export function buildTimingMetrics(ticketRows: FeedbackItem[]): TimingMetrics {
  const now = Date.now();
  const toAssign: number[] = [];
  const toResolve: number[] = [];
  const backlogAgeDays: number[] = [];

  for (const row of ticketRows) {
    const createdAt = new Date(row.createdAt).getTime();
    if (Number.isNaN(createdAt)) continue;

    if (row.assignedAt) {
      const assignedAt = new Date(row.assignedAt).getTime();
      if (!Number.isNaN(assignedAt) && assignedAt >= createdAt) {
        toAssign.push((assignedAt - createdAt) / 3_600_000);
      }
    }

    if (row.resolutionNoteAt) {
      const resolvedAt = new Date(row.resolutionNoteAt).getTime();
      const from = row.assignedAt ? new Date(row.assignedAt).getTime() : createdAt;
      if (!Number.isNaN(resolvedAt) && resolvedAt >= from) {
        toResolve.push((resolvedAt - from) / 3_600_000);
      }
    }

    if (!isClosed(row)) {
      backlogAgeDays.push((now - createdAt) / 86_400_000);
    }
  }

  const backlogBuckets: BacklogBucket[] = BACKLOG_BUCKET_BOUNDS.map((bound, index) => {
    const minDays = index === 0 ? 0 : BACKLOG_BUCKET_BOUNDS[index - 1].maxDays;
    return {
      label: bound.label,
      count: backlogAgeDays.filter((d) => d >= minDays && d < bound.maxDays).length,
    };
  });

  return {
    totalCount: ticketRows.length,
    assignedCount: toAssign.length,
    medianHoursToAssign: median(toAssign),
    p90HoursToAssign: p90(toAssign),
    resolvedCount: toResolve.length,
    medianHoursToResolve: median(toResolve),
    p90HoursToResolve: p90(toResolve),
    openCount: backlogAgeDays.length,
    backlogBuckets,
  };
}
