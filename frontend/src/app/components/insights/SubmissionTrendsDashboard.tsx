import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle,
  Layers,
  MessageSquareWarning,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
} from "lucide-react";
import type { FeedbackItem } from "../../lib/api";
import { getApiHealth } from "../../lib/api";
import { sanitizeOptionalLabel } from "../../lib/fieldSanitize";
import {
  buildSentimentBuckets,
  buildSubmissionsByHour,
  buildVolumeBuckets,
  periodDescription,
  timeSlotLabel,
} from "../../lib/insightsFilters";
import { buildDeptServiceSentimentChartData, type DeptServiceChartRow } from "../../lib/deptServiceChart";
import { countPatientFeedbackGroups } from "../../lib/patientFeedbackGroups";
import { getAiSentimentBucket } from "../../lib/sentiment";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { InsightsKpiCard } from "./InsightsKpiCard";
import { InsightsKpiDetailDialog } from "./InsightsKpiDetailDialog";
import { matchesFollowUp, THEME_RULES, type InsightsKpiKind, type SubmissionChartFilter, type SubmissionSelection } from "./insightsKpiDetail";
import type { InsightsDataState } from "./useInsightsData";

const DEPT_COLORS = ["#2A6FDB", "#2FBF71", "#8B5CF6", "#F4A261", "#E5533D", "#6B7280"];
const CHART_CARD = "rounded-2xl shadow-sm border border-gray-100 transition-shadow hover:shadow-md hover:border-blue-200";

type VolumePoint = { key: string; label: string; count: number };
type SentimentPoint = {
  key: string;
  name: string;
  positive: number;
  neutral: number;
  negative: number;
};
type HourPoint = { label: string; hour: number; count: number };
type PiePoint = { name: string; value: number; color: string };

function serviceFromFeedback(item: FeedbackItem): string {
  const fromIssue = item.feedbackIssues?.find((i) =>
    sanitizeOptionalLabel(i.recommendedService)
  )?.recommendedService;
  return sanitizeOptionalLabel(item.service || fromIssue);
}

type Props = Pick<
  InsightsDataState,
  | "submissionRows"
  | "periodFilter"
  | "timeFilter"
  | "encounterFilter"
  | "customRange"
  | "filterWindow"
>;

export function SubmissionTrendsDashboard({
  submissionRows,
  periodFilter,
  timeFilter,
  encounterFilter,
  customRange,
  filterWindow,
}: Props) {
  const [openRouterConfigured, setOpenRouterConfigured] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<SubmissionSelection | null>(null);

  const openKpi = (kind: InsightsKpiKind) => setSelection({ source: "kpi", kind });
  const openChart = (filter: SubmissionChartFilter) => setSelection({ source: "chart", filter });

  useEffect(() => {
    void getApiHealth().then((health) => {
      setOpenRouterConfigured(Boolean(health.openRouterConfigured));
    });
  }, []);

  const periodLabel = periodDescription(periodFilter, timeFilter, customRange, encounterFilter);
  const filteredTotal = submissionRows.length;
  const patientCount = useMemo(
    () => countPatientFeedbackGroups(submissionRows),
    [submissionRows]
  );
  const avgRating =
    filteredTotal > 0
      ? (
          submissionRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / filteredTotal
        ).toFixed(1)
      : "—";

  const positiveCount = submissionRows.filter((i) => getAiSentimentBucket(i) === "positive").length;
  const neutralCount = submissionRows.filter((i) => getAiSentimentBucket(i) === "neutral").length;
  const negativeCount = submissionRows.filter((i) => getAiSentimentBucket(i) === "negative").length;
  const pendingAiSentimentCount = submissionRows.filter((i) => getAiSentimentBucket(i) === null).length;
  const criticalCount = submissionRows.filter(matchesFollowUp).length;

  const pct = (value: number) =>
    filteredTotal ? `${((value / filteredTotal) * 100).toFixed(1)}% of filtered` : "0%";

  const volumeChartData = useMemo(
    () => buildVolumeBuckets(submissionRows, periodFilter, filterWindow),
    [submissionRows, periodFilter, filterWindow]
  );

  const sentimentChartData = useMemo(
    () =>
      buildSentimentBuckets(submissionRows, periodFilter, filterWindow, getAiSentimentBucket).map(
        (row) => ({
          key: row.key,
          name: row.label,
          positive: row.positive,
          neutral: row.neutral,
          negative: row.negative,
        })
      ),
    [submissionRows, periodFilter, filterWindow]
  );

  const submissionsByHour = useMemo(
    () => buildSubmissionsByHour(submissionRows),
    [submissionRows]
  );

  /** Visit department from EMR/UHID (lookupDepartment), not AI routing per issue. */
  const departmentVolume = useMemo(() => {
    const byDept: Record<string, number> = {};
    for (const row of submissionRows) {
      const key = sanitizeOptionalLabel(row.lookupDepartment || row.department);
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
  }, [submissionRows]);

  /** Where AI routed each complaint (can differ from visit dept — e.g. House Keeping for bathroom). */
  const routingDepartmentVolume = useMemo(() => {
    const byDept: Record<string, number> = {};
    for (const row of submissionRows) {
      const issues =
        Array.isArray(row.feedbackIssues) && row.feedbackIssues.length > 0
          ? row.feedbackIssues
          : null;
      if (issues) {
        for (const issue of issues) {
          const key = sanitizeOptionalLabel(issue.department);
          if (!key) continue;
          byDept[key] = (byDept[key] || 0) + 1;
        }
      }
    }
    return Object.entries(byDept)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], index) => ({
        name,
        value,
        color: DEPT_COLORS[index % DEPT_COLORS.length],
      }));
  }, [submissionRows]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(THEME_RULES.map((r) => [r.category, 0]));
    for (const row of submissionRows) {
      const text = (row.comments || "").toLowerCase();
      for (const rule of THEME_RULES) {
        if (rule.terms.some((term) => text.includes(term))) counts[rule.category] += 1;
      }
    }
    return THEME_RULES.map((r) => ({ category: r.category, count: counts[r.category] || 0 }));
  }, [submissionRows]);

  const topIssues = [...categoryData].sort((a, b) => b.count - a.count).slice(0, 3);

  const highComplaintDepartments = [...departmentVolume]
    .filter((d) =>
      submissionRows
        .filter((i) => sanitizeOptionalLabel(i.lookupDepartment || i.department) === d.name)
        .some((r) => getAiSentimentBucket(r) === "negative")
    )
    .slice(0, 3);

  const highComplaintServices = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of submissionRows) {
      if (getAiSentimentBucket(item) !== "negative") continue;
      const name = serviceFromFeedback(item);
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [submissionRows]);

  const topPerformingDepts = [...departmentVolume]
    .map((d) => {
      const rows = submissionRows.filter(
        (i) => sanitizeOptionalLabel(i.lookupDepartment || i.department) === d.name
      );
      const positive = rows.filter((r) => getAiSentimentBucket(r) === "positive").length;
      const ratio = rows.length ? Math.round((positive / rows.length) * 100) : 0;
      return { name: d.name, ratio };
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);

  const topPerformingServices = useMemo(() => {
    const map = new Map<string, { total: number; positive: number }>();
    for (const item of submissionRows) {
      const name = serviceFromFeedback(item);
      if (!name) continue;
      const prev = map.get(name) || { total: 0, positive: 0 };
      prev.total += 1;
      if (getAiSentimentBucket(item) === "positive") prev.positive += 1;
      map.set(name, prev);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        ratio: v.total ? Math.round((v.positive / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3);
  }, [submissionRows]);

  const deptServiceChartData = useMemo(
    () => buildDeptServiceSentimentChartData(submissionRows),
    [submissionRows]
  );

  const deptServiceChartHeight = Math.max(360, deptServiceChartData.length * 38);

  const openPeriod = (point: VolumePoint) => {
    if (!point.count) return;
    openChart({ type: "period", key: point.key });
  };

  const openPeriodSentiment = (
    point: SentimentPoint,
    sentiment: "positive" | "neutral" | "negative",
    count: number
  ) => {
    if (!count) return;
    openChart({ type: "period-sentiment", key: point.key, sentiment });
  };

  const openDeptService = (
    row: DeptServiceChartRow,
    sentiment: "positive" | "negative",
    count: number
  ) => {
    if (!count) return;
    openChart({
      type: "dept-service",
      department: row.department,
      service: row.service,
      isDepartment: row.isDepartment,
      sentiment,
    });
  };

  return (
    <div className="space-y-8">
      {pendingAiSentimentCount > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {openRouterConfigured === false
            ? `${pendingAiSentimentCount} submission(s) have no AI sentiment yet. Add OPENROUTER_API_KEY to backend/.env and restart the API server.`
            : `${pendingAiSentimentCount} submission(s) are still waiting for AI classification. The server processes these automatically every minute — refresh shortly.`}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-gray-700">{periodLabel}</span> — submissions count every
        row (split tickets included). Click any metric, chart, or action item to view details.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <InsightsKpiCard
          label="Submissions"
          value={filteredTotal}
          sub="All rows · click to view"
          icon={<TrendingUp size={16} className="text-blue-600" />}
          onClick={() => openKpi("submissions")}
        />
        <InsightsKpiCard
          label="Patients"
          value={patientCount}
          sub={`Unique patients · click to view`}
          icon={<Users size={16} className="text-indigo-600" />}
          onClick={() => openKpi("patients")}
        />
        <InsightsKpiCard
          label="Positive (AI)"
          value={positiveCount}
          sub={`${pct(positiveCount)} · click to view`}
          valueClass="text-emerald-600"
          icon={<ThumbsUp size={16} className="text-emerald-600" />}
          onClick={() => openKpi("positive")}
        />
        <InsightsKpiCard
          label="Neutral (AI)"
          value={neutralCount}
          sub={`${pct(neutralCount)} · click to view`}
          valueClass="text-amber-600"
          onClick={() => openKpi("neutral")}
        />
        <InsightsKpiCard
          label="Negative (AI)"
          value={negativeCount}
          sub={`${pct(negativeCount)} · click to view`}
          valueClass="text-red-600"
          icon={<ThumbsDown size={16} className="text-red-600" />}
          onClick={() => openKpi("negative")}
        />
        <InsightsKpiCard
          label="Needs follow-up"
          value={criticalCount}
          sub="Unresolved · click to view"
          valueClass="text-red-600"
          icon={<MessageSquareWarning size={16} className="text-red-600" />}
          onClick={() => openKpi("follow-up")}
        />
        <InsightsKpiCard
          label="Avg rating"
          value={avgRating}
          sub="All submissions · click to view"
          onClick={() => openKpi("submissions")}
        />
      </div>

      <Card className="rounded-2xl shadow-sm border border-amber-100 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            Action required
          </CardTitle>
          <CardDescription>Follow-up by visit department and routing service</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ActionList
              title="Complaint themes"
              icon={<AlertTriangle size={16} className="text-red-600" />}
              items={topIssues.map((i) => ({ label: i.category, value: i.count }))}
              onItemClick={(label) => openChart({ type: "theme", category: label })}
            />
            <ActionList
              title="Departments needing attention"
              icon={<Building2 size={16} className="text-amber-600" />}
              items={highComplaintDepartments.map((d) => ({ label: d.name, value: d.value }))}
              onItemClick={(name) =>
                openChart({ type: "visit-department", name, sentiment: "negative" })
              }
            />
            <ActionList
              title="Services needing attention"
              icon={<Layers size={16} className="text-violet-700" />}
              items={highComplaintServices.map((s) => ({
                label: s.name,
                value: `${s.value} neg.`,
              }))}
              onItemClick={(name) => openChart({ type: "service", name, sentiment: "negative" })}
            />
            <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <CheckCircle size={16} className="text-emerald-600" />
                Strongest departments & services
              </h4>
              <p className="text-xs font-medium text-gray-500 mb-1">Departments</p>
              <RatioList
                items={topPerformingDepts}
                onItemClick={(name) => openChart({ type: "visit-department", name, sentiment: "positive" })}
              />
              <p className="text-xs font-medium text-gray-500 mb-1 mt-3">Services</p>
              <RatioList
                items={topPerformingServices}
                onItemClick={(name) => openChart({ type: "service", name, sentiment: "positive" })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 size={20} className="text-[#2A6FDB]" />
          Department & service sentiment
        </h2>
        <Card className={CHART_CARD}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Department & service — positive vs negative</CardTitle>
            <CardDescription>
              Click a bar segment to view submissions. Bold rows = department; indented = service.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deptServiceChartData.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No department or service sentiment in this period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={deptServiceChartHeight}>
                <BarChart
                  data={deptServiceChartData}
                  layout="vertical"
                  margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="positive"
                    fill="#10b981"
                    name="Positive"
                    stackId="mix"
                    cursor="pointer"
                    onClick={(d) =>
                      openDeptService(
                        d.payload as DeptServiceChartRow,
                        "positive",
                        Number(d.value) || 0
                      )
                    }
                  />
                  <Bar
                    dataKey="negative"
                    fill="#ef4444"
                    name="Negative"
                    stackId="mix"
                    radius={[0, 6, 6, 0]}
                    cursor="pointer"
                    onClick={(d) =>
                      openDeptService(
                        d.payload as DeptServiceChartRow,
                        "negative",
                        Number(d.value) || 0
                      )
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Submission volume & trends</h2>
          <p className="text-xs text-muted-foreground">
            {filteredTotal} submissions (incl. split) · {patientCount} patients ·{" "}
            {timeSlotLabel(timeFilter)}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TrendLineCard
            title="Submission volume"
            description={`One point per ${periodFilter === "weekly" ? "week" : periodFilter === "yearly" ? "month" : "day"} · ${periodLabel} · click a point`}
            empty={volumeChartData.length === 0}
            emptyText="No submissions for this period."
            data={volumeChartData}
            onPointClick={openPeriod}
          />
          <Card className={CHART_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Sentiment trend</CardTitle>
              <CardDescription>Click a bar segment to view submissions</CardDescription>
            </CardHeader>
            <CardContent>
              {sentimentChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">No sentiment data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sentimentChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="positive"
                      fill="#10b981"
                      name="Positive"
                      stackId="t"
                      cursor="pointer"
                      onClick={(d) =>
                        openPeriodSentiment(
                          d.payload as SentimentPoint,
                          "positive",
                          (d.payload as SentimentPoint).positive
                        )
                      }
                    />
                    <Bar
                      dataKey="neutral"
                      fill="#f59e0b"
                      name="Neutral"
                      stackId="t"
                      cursor="pointer"
                      onClick={(d) =>
                        openPeriodSentiment(
                          d.payload as SentimentPoint,
                          "neutral",
                          (d.payload as SentimentPoint).neutral
                        )
                      }
                    />
                    <Bar
                      dataKey="negative"
                      fill="#ef4444"
                      name="Negative"
                      stackId="t"
                      radius={[6, 6, 0, 0]}
                      cursor="pointer"
                      onClick={(d) =>
                        openPeriodSentiment(
                          d.payload as SentimentPoint,
                          "negative",
                          (d.payload as SentimentPoint).negative
                        )
                      }
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className={CHART_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">By time of day</CardTitle>
              <CardDescription>
                When patients submitted · {periodLabel} · click a bar
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredTotal === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={submissionsByHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      fill="#8B5CF6"
                      name="Submissions"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={(d) => {
                        const point = d.payload as HourPoint;
                        if (point?.count) openChart({ type: "hour", hour: point.hour });
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card className={CHART_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Volume by visit department (EMR)</CardTitle>
              <CardDescription>
                Where the patient was seen · {periodLabel} · click a slice
              </CardDescription>
            </CardHeader>
            <CardContent>
              {departmentVolume.length === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">
                  No EMR visit department on submissions in this period.
                </p>
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
                      cursor="pointer"
                      onClick={(d) => {
                        if (d?.name) openChart({ type: "visit-department", name: String(d.name) });
                      }}
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
          <Card className={CHART_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Complaints routed by AI</CardTitle>
              <CardDescription>
                Department assigned per issue · {periodLabel} · click a slice
              </CardDescription>
            </CardHeader>
            <CardContent>
              {routingDepartmentVolume.length === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">
                  No AI routing departments in this period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={routingDepartmentVolume}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={90}
                      dataKey="value"
                      cursor="pointer"
                      onClick={(d) => {
                        if (d?.name) openChart({ type: "routing-department", name: String(d.name) });
                      }}
                    >
                      {routingDepartmentVolume.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Complaint themes</h2>
        <Card className={CHART_CARD}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Categories in comments</CardTitle>
            <CardDescription>Keyword themes · click a bar to view</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="category" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="#2563eb"
                  radius={[0, 8, 8, 0]}
                  cursor="pointer"
                  onClick={(d) => {
                    const category = String((d.payload as { category: string })?.category || "");
                    if (category) openChart({ type: "theme", category });
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <InsightsKpiDetailDialog
        selection={selection}
        onClose={() => setSelection(null)}
        submissionRows={submissionRows}
        periodLabel={periodLabel}
        periodFilter={periodFilter}
        dashboardEncounterFilter={encounterFilter}
      />
    </div>
  );
}

function TrendLineCard({
  title,
  description,
  empty,
  emptyText,
  data,
  onPointClick,
}: {
  title: string;
  description: string;
  empty: boolean;
  emptyText: string;
  data: VolumePoint[];
  onPointClick?: (point: VolumePoint) => void;
}) {
  return (
    <Card className={CHART_CARD}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-muted-foreground text-sm py-12 text-center">{emptyText}</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2563eb"
                strokeWidth={3}
                name="Submissions"
                dot={(props) => {
                  const { cx, cy, payload } = props as {
                    cx?: number;
                    cy?: number;
                    payload?: VolumePoint;
                  };
                  if (cx == null || cy == null || !payload) return null;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={payload.count > 0 ? 5 : 3}
                      fill="#2563eb"
                      style={{ cursor: payload.count > 0 ? "pointer" : "default" }}
                      onClick={() => onPointClick?.(payload)}
                    />
                  );
                }}
                activeDot={{
                  r: 7,
                  onClick: (_e, payload) => {
                    const point = (payload as { payload?: VolumePoint })?.payload;
                    if (point) onPointClick?.(point);
                  },
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ActionList({
  title,
  icon,
  items,
  onItemClick,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ label: string; value: string | number }>;
  onItemClick?: (label: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
        {icon}
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => onItemClick?.(item.label)}
              className="flex w-full justify-between text-sm gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-amber-50/80 transition-colors"
            >
              <span className="truncate">{item.label}</span>
              <Badge variant="outline">{item.value}</Badge>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-muted-foreground text-sm">—</li>}
      </ul>
    </div>
  );
}

function RatioList({
  items,
  onItemClick,
}: {
  items: Array<{ name: string; ratio: number }>;
  onItemClick?: (name: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.name}>
          <button
            type="button"
            onClick={() => onItemClick?.(item.name)}
            className="flex w-full justify-between text-sm gap-2 rounded px-1 py-0.5 text-left hover:bg-emerald-50/80 transition-colors"
          >
            <span className="truncate">{item.name}</span>
            <span className="font-semibold text-emerald-600 shrink-0">{item.ratio}%</span>
          </button>
        </li>
      ))}
      {items.length === 0 && <li className="text-muted-foreground text-sm">—</li>}
    </ul>
  );
}
