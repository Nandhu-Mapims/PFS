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
import { buildDeptServiceSentimentChartData } from "../../lib/deptServiceChart";
import { getAiSentimentBucket } from "../../lib/sentiment";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { InsightsKpiCard } from "./InsightsKpiCard";
import type { InsightsDataState } from "./useInsightsData";

const DEPT_COLORS = ["#2A6FDB", "#2FBF71", "#8B5CF6", "#F4A261", "#E5533D", "#6B7280"];

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

  useEffect(() => {
    void getApiHealth().then((health) => {
      setOpenRouterConfigured(Boolean(health.openRouterConfigured));
    });
  }, []);

  const periodLabel = periodDescription(periodFilter, timeFilter, customRange, encounterFilter);
  const filteredTotal = submissionRows.length;
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
  const criticalCount = submissionRows.filter((i) => {
    if (i.status === "Resolved") return false;
    if (i.aiUrgency === "high" || i.aiSentiment === "negative") return true;
    if (!i.aiAnalyzedAt && (i.rating ?? 0) <= 2) return true;
    return false;
  }).length;

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
    const rules = [
      { category: "Wait Time", terms: ["wait", "delay", "long time", "queue"] },
      { category: "Staff Behavior", terms: ["staff", "rude", "nurse", "attitude"] },
      { category: "Cleanliness", terms: ["clean", "dirty", "hygiene"] },
      { category: "Treatment Quality", terms: ["doctor", "treatment", "care", "diagnosis"] },
      { category: "Billing", terms: ["bill", "charge", "payment", "cost"] },
    ];
    const counts: Record<string, number> = Object.fromEntries(rules.map((r) => [r.category, 0]));
    for (const row of submissionRows) {
      const text = (row.comments || "").toLowerCase();
      for (const rule of rules) {
        if (rule.terms.some((term) => text.includes(term))) counts[rule.category] += 1;
      }
    }
    return rules.map((r) => ({ category: r.category, count: counts[r.category] || 0 }));
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
        Patient feedback sessions (one bot or voice visit = one submission, even when split into
        multiple tickets later).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <InsightsKpiCard
          label="Submissions"
          value={filteredTotal}
          sub="In selected period"
          icon={<TrendingUp size={16} className="text-blue-600" />}
        />
        <InsightsKpiCard
          label="Positive (AI)"
          value={positiveCount}
          sub={pct(positiveCount)}
          valueClass="text-emerald-600"
          icon={<ThumbsUp size={16} className="text-emerald-600" />}
        />
        <InsightsKpiCard
          label="Neutral (AI)"
          value={neutralCount}
          sub={pct(neutralCount)}
          valueClass="text-amber-600"
        />
        <InsightsKpiCard
          label="Negative (AI)"
          value={negativeCount}
          sub={pct(negativeCount)}
          valueClass="text-red-600"
          icon={<ThumbsDown size={16} className="text-red-600" />}
        />
        <InsightsKpiCard
          label="Needs follow-up"
          value={criticalCount}
          sub="Unresolved negative / low rating"
          valueClass="text-red-600"
          icon={<MessageSquareWarning size={16} className="text-red-600" />}
        />
        <InsightsKpiCard
          label="Avg rating"
          value={avgRating}
          sub="Star scale 1–5"
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
            />
            <ActionList
              title="Departments needing attention"
              icon={<Building2 size={16} className="text-amber-600" />}
              items={highComplaintDepartments.map((d) => ({ label: d.name, value: d.value }))}
            />
            <ActionList
              title="Services needing attention"
              icon={<Layers size={16} className="text-violet-700" />}
              items={highComplaintServices.map((s) => ({
                label: s.name,
                value: `${s.value} neg.`,
              }))}
            />
            <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <CheckCircle size={16} className="text-emerald-600" />
                Strongest departments & services
              </h4>
              <p className="text-xs font-medium text-gray-500 mb-1">Departments</p>
              <RatioList items={topPerformingDepts} />
              <p className="text-xs font-medium text-gray-500 mb-1 mt-3">Services</p>
              <RatioList items={topPerformingServices} />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 size={20} className="text-[#2A6FDB]" />
          Department & service sentiment
        </h2>
        <Card className="rounded-2xl shadow-sm border border-gray-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Department & service — positive vs negative</CardTitle>
            <CardDescription>
              Bold rows = department AI assigned to handle the complaint. Indented rows = TMS
              service name, or a short issue summary when no catalog service matched.
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
                  <Bar dataKey="positive" fill="#10b981" name="Positive" stackId="mix" />
                  <Bar
                    dataKey="negative"
                    fill="#ef4444"
                    name="Negative"
                    stackId="mix"
                    radius={[0, 6, 6, 0]}
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
            {filteredTotal} submission(s) · {timeSlotLabel(timeFilter)}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TrendLineCard
            title="Submission volume"
            description={`One point per ${periodFilter === "weekly" ? "week" : periodFilter === "yearly" ? "month" : "day"} · ${periodLabel}`}
            empty={volumeChartData.length === 0}
            emptyText="No submissions for this period."
            data={volumeChartData}
          />
          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Sentiment trend</CardTitle>
              <CardDescription>Positive, neutral, negative per period</CardDescription>
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
                    <Bar dataKey="positive" fill="#10b981" name="Positive" stackId="t" />
                    <Bar dataKey="neutral" fill="#f59e0b" name="Neutral" stackId="t" />
                    <Bar dataKey="negative" fill="#ef4444" name="Negative" stackId="t" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">By time of day</CardTitle>
              <CardDescription>When patients submitted · {periodLabel}</CardDescription>
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
                    <Bar dataKey="count" fill="#8B5CF6" name="Submissions" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Volume by visit department (EMR)</CardTitle>
              <CardDescription>
                Where the patient was seen (UHID lookup) · {periodLabel}
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
              <CardTitle className="text-lg">Complaints routed by AI</CardTitle>
              <CardDescription>
                Department assigned per issue (e.g. House Keeping for bathroom) · {periodLabel}
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
        <Card className="rounded-2xl shadow-sm border border-gray-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Categories in comments</CardTitle>
            <CardDescription>Keyword themes in patient feedback text</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="category" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function TrendLineCard({
  title,
  description,
  empty,
  emptyText,
  data,
}: {
  title: string;
  description: string;
  empty: boolean;
  emptyText: string;
  data: Array<{ label: string; count: number }>;
}) {
  return (
    <Card className="rounded-2xl shadow-sm border border-gray-100">
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
                dot={{ fill: "#2563eb", r: 4 }}
                name="Submissions"
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
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ label: string; value: string | number }>;
}) {
  return (
    <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
        {icon}
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex justify-between text-sm gap-2">
            <span className="truncate">{item.label}</span>
            <Badge variant="outline">{item.value}</Badge>
          </li>
        ))}
        {items.length === 0 && <li className="text-muted-foreground text-sm">—</li>}
      </ul>
    </div>
  );
}

function RatioList({ items }: { items: Array<{ name: string; ratio: number }> }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.name} className="flex justify-between text-sm gap-2">
          <span className="truncate">{item.name}</span>
          <span className="font-semibold text-emerald-600 shrink-0">{item.ratio}%</span>
        </li>
      ))}
      {items.length === 0 && <li className="text-muted-foreground text-sm">—</li>}
    </ul>
  );
}
