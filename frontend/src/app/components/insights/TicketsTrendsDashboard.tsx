import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, CheckCircle2, ClipboardList, Clock, Split } from "lucide-react";
import { sanitizeOptionalLabel } from "../../lib/fieldSanitize";
import {
  buildStatusBuckets,
  buildSubmissionsByHour,
  buildVolumeBuckets,
  periodDescription,
  timeSlotLabel,
} from "../../lib/insightsFilters";
import { getAiSentimentBucket } from "../../lib/sentiment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { InsightsKpiCard } from "./InsightsKpiCard";
import type { InsightsDataState } from "./useInsightsData";

const DEPT_COLORS = ["#2A6FDB", "#2FBF71", "#8B5CF6", "#F4A261", "#E5533D", "#6B7280"];

type Props = Pick<
  InsightsDataState,
  "ticketRows" | "periodFilter" | "timeFilter" | "encounterFilter" | "customRange" | "filterWindow"
>;

export function TicketsTrendsDashboard({
  ticketRows,
  periodFilter,
  timeFilter,
  encounterFilter,
  customRange,
  filterWindow,
}: Props) {
  const periodLabel = periodDescription(periodFilter, timeFilter, customRange, encounterFilter);
  const totalTickets = ticketRows.length;

  const statusNew = ticketRows.filter((t) => t.status === "New").length;
  const statusInProgress = ticketRows.filter((t) => t.status === "In Progress").length;
  const statusResolved = ticketRows.filter((t) => t.status === "Resolved").length;
  const openTickets = statusNew + statusInProgress;
  const splitTickets = ticketRows.filter((t) => t.isSplitChild).length;
  const negativeTickets = ticketRows.filter((t) => getAiSentimentBucket(t) === "negative").length;

  const volumeChartData = useMemo(
    () => buildVolumeBuckets(ticketRows, periodFilter, filterWindow),
    [ticketRows, periodFilter, filterWindow]
  );

  const statusChartData = useMemo(
    () => buildStatusBuckets(ticketRows, periodFilter, filterWindow),
    [ticketRows, periodFilter, filterWindow]
  );

  const ticketsByHour = useMemo(() => buildSubmissionsByHour(ticketRows), [ticketRows]);

  const departmentVolume = useMemo(() => {
    const byDept: Record<string, number> = {};
    for (const row of ticketRows) {
      const key = sanitizeOptionalLabel(
        row.department || row.lookupDepartment
      );
      if (!key) continue;
      byDept[key] = (byDept[key] || 0) + 1;
    }
    return Object.entries(byDept)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], index) => ({
        name,
        value,
        color: DEPT_COLORS[index % DEPT_COLORS.length],
      }));
  }, [ticketRows]);

  const serviceVolume = useMemo(() => {
    const byService: Record<string, number> = {};
    for (const row of ticketRows) {
      const key = sanitizeOptionalLabel(row.service);
      if (!key) continue;
      byService[key] = (byService[key] || 0) + 1;
    }
    return Object.entries(byService)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], index) => ({
        name,
        value,
        color: DEPT_COLORS[index % DEPT_COLORS.length],
      }));
  }, [ticketRows]);

  const statusPie = [
    { name: "New", value: statusNew, color: "#3b82f6" },
    { name: "In Progress", value: statusInProgress, color: "#f59e0b" },
    { name: "Resolved", value: statusResolved, color: "#10b981" },
  ].filter((s) => s.value > 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Complaint tickets raised from feedback (each split issue counts as its own ticket when AI
        finds multiple problems in one visit).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <InsightsKpiCard
          label="Tickets"
          value={totalTickets}
          sub="With ticket ID in period"
          icon={<ClipboardList size={16} className="text-blue-600" />}
        />
        <InsightsKpiCard
          label="Open"
          value={openTickets}
          sub="New + In progress"
          valueClass="text-amber-600"
          icon={<Clock size={16} className="text-amber-600" />}
        />
        <InsightsKpiCard
          label="Resolved"
          value={statusResolved}
          sub={totalTickets ? `${Math.round((statusResolved / totalTickets) * 100)}% closed` : "—"}
          valueClass="text-emerald-600"
          icon={<CheckCircle2 size={16} className="text-emerald-600" />}
        />
        <InsightsKpiCard
          label="Negative (AI)"
          value={negativeTickets}
          sub="Tickets with negative sentiment"
          valueClass="text-red-600"
          icon={<AlertCircle size={16} className="text-red-600" />}
        />
        <InsightsKpiCard
          label="Split issue tickets"
          value={splitTickets}
          sub="From multi-issue bot/voice sessions"
          icon={<Split size={16} className="text-violet-600" />}
        />
        <InsightsKpiCard label="New" value={statusNew} sub="Not yet started" />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Ticket volume & trends</h2>
          <p className="text-xs text-muted-foreground">
            {totalTickets} ticket(s) · {timeSlotLabel(timeFilter)}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Tickets opened</CardTitle>
              <CardDescription>
                One point per{" "}
                {periodFilter === "weekly" ? "week" : periodFilter === "yearly" ? "month" : "day"} ·{" "}
                {periodLabel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {volumeChartData.length === 0 || totalTickets === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">
                  No tickets in this period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={volumeChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#0d9488"
                      strokeWidth={3}
                      dot={{ fill: "#0d9488", r: 4 }}
                      name="Tickets"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Status over time</CardTitle>
              <CardDescription>New, in progress, and resolved per period</CardDescription>
            </CardHeader>
            <CardContent>
              {statusChartData.length === 0 || totalTickets === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">No ticket data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={statusChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="new" fill="#3b82f6" name="New" stackId="s" />
                    <Bar dataKey="inProgress" fill="#f59e0b" name="In progress" stackId="s" />
                    <Bar dataKey="resolved" fill="#10b981" name="Resolved" stackId="s" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Current status mix</CardTitle>
              <CardDescription>Snapshot for tickets in range</CardDescription>
            </CardHeader>
            <CardContent>
              {statusPie.length === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">No tickets.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusPie}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={90}
                      dataKey="value"
                    >
                      {statusPie.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">By time of day</CardTitle>
              <CardDescription>When tickets were created · {periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {totalTickets === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={ticketsByHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0d9488" name="Tickets" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Tickets by department</CardTitle>
              <CardDescription>Routing / visit department · {periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentVolume.length === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">No department data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={departmentVolume}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={90}
                      dataKey="value"
                    >
                      {departmentVolume.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Tickets by service</CardTitle>
              <CardDescription>AI routing service · {periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {serviceVolume.length === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">No service data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={serviceVolume} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0d9488" name="Tickets" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
