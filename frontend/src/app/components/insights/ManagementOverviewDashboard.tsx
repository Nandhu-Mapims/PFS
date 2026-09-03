import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { colorsForKeys, ORDINAL_BLUE } from "../../lib/chartPalette";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  ListOrdered,
} from "lucide-react";
import { getHospitalDepartments, getUsers, type Department, type UserRow } from "../../lib/api";
import {
  buildTopComplaints,
  collectComplaintSlices,
  type TopComplaintRow,
} from "../../lib/complaintTopics";
import {
  buildDepartmentScorecard,
  buildTimingMetrics,
  formatHours,
  scorecardTotals,
  sortScorecard,
  type ScorecardRow,
  type ScorecardSort,
} from "../../lib/managementScorecard";
import { periodDescription, timeSlotLabel } from "../../lib/insightsFilters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { InsightsDataState } from "./useInsightsData";

const CHART_CARD =
  "rounded-2xl shadow-sm border border-gray-100 transition-shadow hover:shadow-md hover:border-teal-200";

// Colour comes from the shared, validated chart palette (see chartPalette.ts).
// The previous ramp ran red-to-green by array position, which reads as a
// severity gradient (worst-to-best) even though topics are unordered categories --
// a sequential hue doing a categorical job. Identity is keyed to the topic name
// via colorsForKeys, which also guarantees every theme in the top 10 gets a
// distinct one of the 8 fixed hues (plain per-name hashing left several themes
// sharing a colour purely by hash coincidence).

type Props = Pick<
  InsightsDataState,
  | "filteredByPeriod"
  | "ticketRows"
  | "periodFilter"
  | "timeFilter"
  | "encounterFilter"
  | "customRange"
>;

function SummaryTile({
  label,
  value,
  sub,
  gradient,
  icon,
}: {
  label: string;
  value: number | string;
  sub: string;
  gradient: string;
  icon: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-md min-h-[120px] flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-90">{label}</span>
        {icon}
      </div>
      <div>
        <p className="text-4xl font-bold tabular-nums">{value}</p>
        <p className="text-sm opacity-90 mt-1">{sub}</p>
      </div>
    </div>
  );
}

/** Close-rate pill — red below 50%, amber below 80%, green above. */
function RatePill({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const tone =
    value >= 80
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value >= 50
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span
      className={`inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
    >
      {value}%
    </span>
  );
}

function TopComplaintsTable({
  rows,
  colors,
}: {
  rows: TopComplaintRow[];
  colors: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No negative feedback in this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Complaint theme</th>
            <th className="py-2 pr-3 text-right font-medium">Complaints</th>
            <th className="py-2 pr-3 text-right font-medium">Share</th>
            <th className="py-2 pr-3 text-right font-medium">Open</th>
            <th className="py-2 pr-3 text-right font-medium">Closed</th>
            <th className="py-2 pr-3 font-medium">Top departments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isOpen = expanded === row.topic;
            return (
              <Fragment key={row.topic}>
                <tr
                  className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
                  onClick={() => setExpanded(isOpen ? null : row.topic)}
                >
                  <td className="py-2.5 pr-2 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="py-2.5 pr-3 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-1.5">
                      {isOpen ? (
                        <ChevronDown size={14} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-400" />
                      )}
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[row.topic] }}
                      />
                      {row.topic}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{row.count}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                    {row.share}%
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-amber-700">
                    {row.openCount}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-700">
                    {row.resolvedCount}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                    {row.departments
                      .slice(0, 2)
                      .map((d) => `${d.name} (${d.count})`)
                      .join(", ")}
                    {row.departments.length > 2 ? ` +${row.departments.length - 2}` : ""}
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <td />
                    <td colSpan={6} className="py-3 pr-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Example complaints
                      </p>
                      {row.examples.length ? (
                        <ul className="space-y-1">
                          {row.examples.map((example) => (
                            <li key={example} className="text-xs leading-relaxed text-gray-700">
                              &ldquo;{example}&rdquo;
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">No text captured.</p>
                      )}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Raised across {row.departments.length} department(s) ·{" "}
                        {row.ticketCount} ticket(s) opened
                      </p>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScorecardTable({ rows }: { rows: ScorecardRow[] }) {
  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No complaint tickets in this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Department</th>
            <th className="py-2 pr-3 font-medium">HOD</th>
            <th className="py-2 pr-3 text-right font-medium">Tickets</th>
            <th className="py-2 pr-3 text-right font-medium">Open</th>
            <th className="py-2 pr-3 text-right font-medium">Closed</th>
            <th className="py-2 pr-3 text-right font-medium">Close rate</th>
            <th className="py-2 pr-3 text-right font-medium">CAPA written</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.department}
              className="border-b border-gray-100 transition-colors hover:bg-gray-50"
            >
              <td className="py-2.5 pr-3 font-medium text-gray-900">{row.department}</td>
              <td className="py-2.5 pr-3 text-gray-700">
                {row.hod ? (
                  <span className="inline-flex items-center gap-1.5">
                    {row.hod}
                    {row.hodFromAssignment ? (
                      <span
                        className="text-[10px] text-muted-foreground"
                        title="Not mapped in the department catalog — inferred from ticket assignments"
                      >
                        (by assignment)
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle size={12} />
                    No HOD mapped
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{row.total}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-amber-700">{row.open}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-700">{row.closed}</td>
              <td className="py-2.5 pr-3 text-right">
                <RatePill value={row.closeRate} />
              </td>
              <td className="py-2.5 pr-3 text-right">
                <span className="inline-flex items-center justify-end gap-2">
                  <span className="tabular-nums text-gray-700">
                    {row.capaWritten}/{row.closed}
                  </span>
                  <RatePill value={row.capaCoverage} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ManagementOverviewDashboard({
  filteredByPeriod,
  ticketRows,
  periodFilter,
  timeFilter,
  encounterFilter,
  customRange,
}: Props) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sort, setSort] = useState<ScorecardSort>("volume");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [depts, userRows] = await Promise.all([
        getHospitalDepartments().catch(() => [] as Department[]),
        getUsers().catch(() => [] as UserRow[]),
      ]);
      if (cancelled) return;
      setDepartments(depts);
      setUsers(userRows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const periodLabel = periodDescription(periodFilter, timeFilter, customRange, encounterFilter);

  const complaintSlices = useMemo(
    () => collectComplaintSlices(filteredByPeriod),
    [filteredByPeriod]
  );

  const topComplaints = useMemo(
    () => buildTopComplaints(complaintSlices, 10, departments.map((d) => d.name)),
    [complaintSlices, departments]
  );

  const scorecard = useMemo(
    () => buildDepartmentScorecard(ticketRows, departments, users),
    [ticketRows, departments, users]
  );

  const sortedScorecard = useMemo(() => sortScorecard(scorecard, sort), [scorecard, sort]);
  const totals = useMemo(() => scorecardTotals(scorecard), [scorecard]);
  const timing = useMemo(() => buildTimingMetrics(ticketRows), [ticketRows]);
  const backlogChartData = useMemo(
    () =>
      timing.backlogBuckets.map((bucket, index) => ({
        label: bucket.label,
        count: bucket.count,
        color: ORDINAL_BLUE[index] ?? ORDINAL_BLUE[ORDINAL_BLUE.length - 1],
      })),
    [timing]
  );

  const topicColors = useMemo(
    () => colorsForKeys(topComplaints.map((row) => row.topic)),
    [topComplaints]
  );

  const chartData = useMemo(
    () =>
      topComplaints.map((row) => ({
        name: row.topic,
        value: row.count,
        color: topicColors[row.topic],
      })),
    [topComplaints, topicColors]
  );

  const unmappedDepartments = scorecard.filter((r) => !r.hod).length;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Complaint themes are merged across AI tag spellings. {periodLabel} ·{" "}
        {timeSlotLabel(timeFilter)}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Complaints"
          value={complaintSlices.length}
          sub={`${topComplaints.length} theme(s) ranked`}
          gradient="from-red-500 to-red-700"
          icon={<ListOrdered size={22} className="opacity-90" />}
        />
        <SummaryTile
          label="Complaints closed"
          value={totals.closed}
          sub={`${totals.closeRate}% of ${totals.total} ticket(s)`}
          gradient="from-emerald-500 to-emerald-700"
          icon={<CheckCircle2 size={22} className="opacity-90" />}
        />
        <SummaryTile
          label="CAPA written"
          value={totals.capaWritten}
          sub={
            totals.capaCoverage === null
              ? "No closed tickets yet"
              : `${totals.capaCoverage}% of closed tickets`
          }
          gradient="from-violet-500 to-violet-800"
          icon={<ClipboardCheck size={22} className="opacity-90" />}
        />
        <SummaryTile
          label="Departments"
          value={totals.departments}
          sub={
            unmappedDepartments
              ? `${unmappedDepartments} without a mapped HOD`
              : "All have a mapped HOD"
          }
          gradient="from-[#2A6FDB] to-blue-800"
          icon={<Building2 size={22} className="opacity-90" />}
        />
      </div>

      <Card className={CHART_CARD}>
        <CardHeader>
          <CardTitle className="text-base">Top 10 complaints</CardTitle>
          <CardDescription>
            Every negative issue counted once, grouped by theme. Click a row for examples.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 34)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [`${value} complaint(s)`, "Count"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : null}
          <TopComplaintsTable rows={topComplaints} colors={topicColors} />
        </CardContent>
      </Card>

      <Card className={CHART_CARD}>
        <CardHeader>
          <CardTitle className="text-base">Response time &amp; backlog age</CardTitle>
          <CardDescription>
            Measured from ticket timestamps already on record — no closed tickets yet, so
            time-to-resolve has no samples until the first one closes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock size={14} /> Time to first assignment
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {formatHours(timing.medianHoursToAssign)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {timing.assignedCount
                  ? `Median over ${timing.assignedCount} assigned ticket(s) · p90 ${formatHours(
                      timing.p90HoursToAssign
                    )}`
                  : "No tickets have been assigned yet"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 size={14} /> Time to resolution
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {formatHours(timing.medianHoursToResolve)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {timing.resolvedCount
                  ? `Median over ${timing.resolvedCount} resolved ticket(s) · p90 ${formatHours(
                      timing.p90HoursToResolve
                    )}`
                  : "No closed tickets yet"}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Backlog age — {timing.openCount} open ticket(s)
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={backlogChartData}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [`${value} ticket(s)`, "Open"]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {backlogChartData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className={CHART_CARD}>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Department / HOD performance</CardTitle>
              <CardDescription>
                Complaint tickets by owning department, with the accountable HOD.
              </CardDescription>
            </div>
            <div
              className="grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-50 p-1 text-xs"
              role="tablist"
              aria-label="Scorecard sort"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sort === "volume"}
                onClick={() => setSort("volume")}
                className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                  sort === "volume"
                    ? "bg-[#2A6FDB] text-white shadow-sm"
                    : "text-gray-600 hover:bg-white"
                }`}
              >
                Most tickets
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sort === "closeRate"}
                onClick={() => setSort("closeRate")}
                className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                  sort === "closeRate"
                    ? "bg-[#2A6FDB] text-white shadow-sm"
                    : "text-gray-600 hover:bg-white"
                }`}
              >
                Lowest close rate
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScorecardTable rows={sortedScorecard} />
        </CardContent>
      </Card>
    </div>
  );
}
