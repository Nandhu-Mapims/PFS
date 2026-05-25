import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import {
  getFeedback,
  getFeedbackAnalytics,
  type FeedbackAnalytics,
  type FeedbackItem,
} from "../lib/api";
import { sanitizeOptionalLabel } from "../lib/fieldSanitize";
import {
  buildSentimentBuckets,
  buildSubmissionsByHour,
  buildVolumeBuckets,
  filterItemsInWindow,
  hasCustomDateRange,
  isDefaultPresetRange,
  periodDescription,
  rangesEqual,
  resolveFilterWindow,
  thisMonthRange,
  thisWeekRange,
  type CustomDateRange,
  type PeriodGranularity,
  type TimeOfDaySlot,
  timeSlotLabel,
} from "../lib/insightsFilters";
import { buildDeptServiceSentimentChartData } from "../lib/deptServiceChart";
import { getAiSentimentBucket } from "../lib/sentiment";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const DEPT_COLORS = ["#2A6FDB", "#2FBF71", "#8B5CF6", "#F4A261", "#E5533D", "#6B7280"];

function serviceFromFeedback(item: FeedbackItem): string {
  const fromIssue = item.feedbackIssues?.find((i) =>
    sanitizeOptionalLabel(i.recommendedService)
  )?.recommendedService;
  return sanitizeOptionalLabel(item.service || fromIssue);
}

function KpiCard({
  label,
  value,
  sub,
  valueClass = "",
  icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  valueClass?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="rounded-2xl shadow-sm border border-gray-100">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-[10px] uppercase tracking-wider font-medium">
            {label}
          </CardDescription>
          {icon}
        </div>
        <CardTitle className={`text-3xl tabular-nums ${valueClass}`}>{value}</CardTitle>
      </CardHeader>
      {sub ? <CardContent className="pt-0 text-muted-foreground text-xs">{sub}</CardContent> : null}
    </Card>
  );
}

export function InsightsDashboard() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [analytics, setAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodGranularity>("weekly");
  const [timeFilter, setTimeFilter] = useState<TimeOfDaySlot>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [feedbackRows, analyticsData] = await Promise.all([
        getFeedback(),
        getFeedbackAnalytics(),
      ]);
      setItems(feedbackRows);
      setAnalytics(analyticsData);
    } catch {
      setError("Failed to load insights. Check that the API and database are running.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const customRange = useMemo(
    () => ({ from: customFrom, to: customTo }),
    [customFrom, customTo]
  );

  const filterWindow = useMemo(
    () => resolveFilterWindow(periodFilter, customRange),
    [periodFilter, customFrom, customTo, customRange]
  );

  const filteredByPeriod = useMemo(
    () => filterItemsInWindow(items, filterWindow, timeFilter),
    [items, filterWindow, timeFilter]
  );

  const periodLabel = periodDescription(periodFilter, timeFilter, customRange);
  const usingCustomRange = hasCustomDateRange(customRange);

  const applyRange = (range: CustomDateRange) => {
    setCustomFrom(range.from);
    setCustomTo(range.to);
  };

  const clearRange = () => {
    setCustomFrom("");
    setCustomTo("");
  };

  const presetChipClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
      active
        ? "bg-[#2A6FDB] text-white shadow-sm"
        : "border border-gray-200 bg-white text-gray-700 hover:border-[#2A6FDB]/40"
    }`;
  const filteredTotal = filteredByPeriod.length;

  const totalFeedback = filteredTotal;
  const positiveCount = filteredByPeriod.filter((i) => getAiSentimentBucket(i) === "positive").length;
  const neutralCount = filteredByPeriod.filter((i) => getAiSentimentBucket(i) === "neutral").length;
  const negativeCount = filteredByPeriod.filter((i) => getAiSentimentBucket(i) === "negative").length;
  const pendingAiSentimentCount = filteredByPeriod.filter((i) => getAiSentimentBucket(i) === null).length;
  const criticalCount = filteredByPeriod.filter((i) => {
    if (i.status === "Resolved") return false;
    if (i.aiUrgency === "high" || i.aiSentiment === "negative") return true;
    if (!i.aiAnalyzedAt && (i.rating ?? 0) <= 2) return true;
    return false;
  }).length;

  const pct = (value: number) =>
    filteredTotal ? `${((value / filteredTotal) * 100).toFixed(1)}% of filtered` : "0%";

  const volumeChartData = useMemo(
    () => buildVolumeBuckets(filteredByPeriod, periodFilter, filterWindow),
    [filteredByPeriod, periodFilter, filterWindow]
  );

  const sentimentChartData = useMemo(
    () =>
      buildSentimentBuckets(filteredByPeriod, periodFilter, filterWindow, getAiSentimentBucket).map(
        (row) => ({
          name: row.label,
          positive: row.positive,
          neutral: row.neutral,
          negative: row.negative,
        })
      ),
    [filteredByPeriod, periodFilter]
  );

  const submissionsByHour = useMemo(
    () => buildSubmissionsByHour(filteredByPeriod),
    [filteredByPeriod]
  );

  const departmentVolume = useMemo(() => {
    const byDept: Record<string, number> = {};
    for (const row of filteredByPeriod) {
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
  }, [filteredByPeriod]);

  const categoryData = useMemo(() => {
    const rules = [
      { category: "Wait Time", terms: ["wait", "delay", "long time", "queue"] },
      { category: "Staff Behavior", terms: ["staff", "rude", "nurse", "attitude"] },
      { category: "Cleanliness", terms: ["clean", "dirty", "hygiene"] },
      { category: "Treatment Quality", terms: ["doctor", "treatment", "care", "diagnosis"] },
      { category: "Billing", terms: ["bill", "charge", "payment", "cost"] },
    ];
    const counts: Record<string, number> = Object.fromEntries(rules.map((r) => [r.category, 0]));
    for (const row of filteredByPeriod) {
      const text = (row.comments || "").toLowerCase();
      for (const rule of rules) {
        if (rule.terms.some((term) => text.includes(term))) counts[rule.category] += 1;
      }
    }
    return rules.map((r) => ({ category: r.category, count: counts[r.category] || 0 }));
  }, [filteredByPeriod]);

  const topIssues = [...categoryData].sort((a, b) => b.count - a.count).slice(0, 3);
  const highComplaintDepartments = [...departmentVolume]
    .filter((d) =>
      filteredByPeriod
        .filter((i) => sanitizeOptionalLabel(i.lookupDepartment || i.department) === d.name)
        .some((r) => getAiSentimentBucket(r) === "negative")
    )
    .slice(0, 3);
  const topPerformingDepts = [...departmentVolume]
    .map((d) => {
      const rows = filteredByPeriod.filter(
        (i) => sanitizeOptionalLabel(i.lookupDepartment || i.department) === d.name
      );
      const positive = rows.filter((r) => getAiSentimentBucket(r) === "positive").length;
      const ratio = rows.length ? Math.round((positive / rows.length) * 100) : 0;
      return { name: d.name, ratio };
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);

  const highComplaintServices = (analytics?.negativeByService ?? [])
    .slice(0, 3)
    .map((row) => ({ name: row.service, value: row.count }));

  const topPerformingServices = useMemo(() => {
    const map = new Map<string, { total: number; positive: number }>();
    for (const item of filteredByPeriod) {
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
  }, [filteredByPeriod]);

  const deptServiceChartData = useMemo(
    () => buildDeptServiceSentimentChartData(filteredByPeriod),
    [filteredByPeriod]
  );

  const periodFilterBar = (
    <Card className="rounded-2xl shadow-sm border border-gray-100">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Period & time</p>
            <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  { id: "daily" as const, label: "Daily" },
                  { id: "weekly" as const, label: "Week" },
                  { id: "yearly" as const, label: "Month" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPeriodFilter(opt.id);
                    clearRange();
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    periodFilter === opt.id
                      ? "bg-[#2A6FDB] text-white shadow-sm"
                      : "text-gray-600 hover:bg-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeOfDaySlot)}>
              <SelectTrigger className="w-full sm:w-[220px] rounded-xl">
                <SelectValue placeholder="Time of day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All times</SelectItem>
                <SelectItem value="morning">Morning (6am–12pm)</SelectItem>
                <SelectItem value="afternoon">Afternoon (12pm–6pm)</SelectItem>
                <SelectItem value="evening">Evening (6pm–12am)</SelectItem>
                <SelectItem value="night">Night (12am–6am)</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-muted-foreground">
            {periodFilter === "weekly"
              ? "Group by week — pick a quick range or set custom dates."
              : periodFilter === "yearly"
                ? "Group by month — pick this month, last 12 months, or custom dates."
                : "Group by day — pick this week, last 30 days, or custom dates."}
          </p>

          <div className="flex flex-wrap gap-2">
            {periodFilter === "weekly" ? (
              <>
                <button
                  type="button"
                  className={presetChipClass(rangesEqual(customRange, thisWeekRange()))}
                  onClick={() => applyRange(thisWeekRange())}
                >
                  This week
                </button>
                <button
                  type="button"
                  className={presetChipClass(isDefaultPresetRange(periodFilter, customRange))}
                  onClick={clearRange}
                >
                  Last 12 weeks
                </button>
              </>
            ) : periodFilter === "yearly" ? (
              <>
                <button
                  type="button"
                  className={presetChipClass(rangesEqual(customRange, thisMonthRange()))}
                  onClick={() => applyRange(thisMonthRange())}
                >
                  This month
                </button>
                <button
                  type="button"
                  className={presetChipClass(isDefaultPresetRange(periodFilter, customRange))}
                  onClick={clearRange}
                >
                  Last 12 months
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={presetChipClass(rangesEqual(customRange, thisWeekRange()))}
                  onClick={() => applyRange(thisWeekRange())}
                >
                  This week
                </button>
                <button
                  type="button"
                  className={presetChipClass(isDefaultPresetRange(periodFilter, customRange))}
                  onClick={clearRange}
                >
                  Last 30 days
                </button>
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label htmlFor="insights-from" className="text-xs font-medium text-gray-700">
                From
              </label>
              <input
                id="insights-from"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2A6FDB]"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label htmlFor="insights-to" className="text-xs font-medium text-gray-700">
                To
              </label>
              <input
                id="insights-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2A6FDB]"
              />
            </div>
            {usingCustomRange ? (
              <button
                type="button"
                onClick={clearRange}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {periodFilter === "weekly"
                  ? "Reset to last 12 weeks"
                  : periodFilter === "yearly"
                    ? "Reset to last 12 months"
                    : "Reset to last 30 days"}
              </button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading insights…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  const kpiRow = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
        label="Total feedback"
        value={totalFeedback}
        sub="In selected period"
        icon={<TrendingUp size={16} className="text-blue-600" />}
      />
      <KpiCard
        label="Positive (AI)"
        value={positiveCount}
        sub={pct(positiveCount)}
        valueClass="text-emerald-600"
        icon={<ThumbsUp size={16} className="text-emerald-600" />}
      />
      <KpiCard
        label="Neutral (AI)"
        value={neutralCount}
        sub={pct(neutralCount)}
        valueClass="text-amber-600"
      />
      <KpiCard
        label="Negative (AI)"
        value={negativeCount}
        sub={pct(negativeCount)}
        valueClass="text-red-600"
        icon={<ThumbsDown size={16} className="text-red-600" />}
      />
      <KpiCard
        label="Critical queue"
        value={criticalCount}
        sub="Needs follow-up"
        valueClass="text-red-600"
        icon={<MessageSquareWarning size={16} className="text-red-600" />}
      />
      <KpiCard
        label="Avg rating"
        value={analytics?.totals.averageRating ?? "—"}
        sub="Star scale 1–5"
      />
    </div>
  );

  const actionRequiredCard = (
    <Card className="rounded-2xl shadow-sm border border-amber-100 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          Action required
        </CardTitle>
        <CardDescription>
          Follow-up by visit department (EMR) and routing service (AI)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <AlertTriangle size={16} className="text-red-600" />
              Complaint themes
            </h4>
            <ul className="space-y-2">
              {topIssues.map((issue) => (
                <li key={issue.category} className="flex justify-between text-sm gap-2">
                  <span className="truncate">{issue.category}</span>
                  <Badge variant="outline">{issue.count}</Badge>
                </li>
              ))}
              {topIssues.length === 0 && (
                <li className="text-muted-foreground text-sm">—</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Building2 size={16} className="text-amber-600" />
              Departments needing attention
            </h4>
            <ul className="space-y-2">
              {highComplaintDepartments.map((dept) => (
                <li key={dept.name} className="flex justify-between text-sm gap-2">
                  <span className="truncate">{dept.name}</span>
                  <Badge variant="outline">{dept.value}</Badge>
                </li>
              ))}
              {highComplaintDepartments.length === 0 && (
                <li className="text-muted-foreground text-sm">—</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Layers size={16} className="text-violet-700" />
              Services needing attention
            </h4>
            <ul className="space-y-2">
              {highComplaintServices.map((svc) => (
                <li key={svc.name} className="flex justify-between text-sm gap-2">
                  <span className="truncate">{svc.name}</span>
                  <Badge variant="outline">{svc.value} neg.</Badge>
                </li>
              ))}
              {highComplaintServices.length === 0 && (
                <li className="text-muted-foreground text-sm">—</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-white bg-white/80 p-4 shadow-sm">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <CheckCircle size={16} className="text-emerald-600" />
              Strongest departments & services
            </h4>
            <p className="text-xs font-medium text-gray-500 mb-1">Departments</p>
            <ul className="space-y-1.5 mb-3">
              {topPerformingDepts.map((dept) => (
                <li key={dept.name} className="flex justify-between text-sm gap-2">
                  <span className="truncate">{dept.name}</span>
                  <span className="font-semibold text-emerald-600 shrink-0">{dept.ratio}%</span>
                </li>
              ))}
              {topPerformingDepts.length === 0 && (
                <li className="text-muted-foreground text-sm">—</li>
              )}
            </ul>
            <p className="text-xs font-medium text-gray-500 mb-1">Services</p>
            <ul className="space-y-1.5">
              {topPerformingServices.map((svc) => (
                <li key={svc.name} className="flex justify-between text-sm gap-2">
                  <span className="truncate">{svc.name}</span>
                  <span className="font-semibold text-emerald-600 shrink-0">{svc.ratio}%</span>
                </li>
              ))}
              {topPerformingServices.length === 0 && (
                <li className="text-muted-foreground text-sm">—</li>
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const deptServiceChartHeight = Math.max(360, deptServiceChartData.length * 38);

  const deptServiceMixedChart = (
    <Card className="rounded-2xl shadow-sm border border-gray-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Department & service — positive vs negative</CardTitle>
        <CardDescription>
          Bold rows are visit departments (EMR/UHID). Indented rows are AI routing services under each
          department.
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
              <YAxis
                type="category"
                dataKey="label"
                width={200}
                tick={({ x, y, payload }) => {
                  const row = deptServiceChartData.find((d) => d.label === payload.value);
                  const isDept = row?.isDepartment ?? false;
                  return (
                    <text
                      x={x}
                      y={y}
                      dy={4}
                      textAnchor="end"
                      fill={isDept ? "#111827" : "#6b7280"}
                      fontSize={isDept ? 12 : 11}
                      fontWeight={isDept ? 700 : 400}
                    >
                      {payload.value}
                    </text>
                  );
                }}
              />
              <Tooltip
                content={({ active, payload: tipPayload }) => {
                  if (!active || !tipPayload?.length) return null;
                  const row = tipPayload[0].payload as (typeof deptServiceChartData)[0];
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
                      <p className="font-semibold text-gray-900">
                        {row.isDepartment ? row.department : row.service}
                      </p>
                      <p className="text-xs text-gray-500 mb-1">
                        {row.isDepartment ? "Department total" : `Service · ${row.department}`}
                      </p>
                      <p className="text-emerald-700">Positive: {row.positive}</p>
                      <p className="text-red-600">Negative: {row.negative}</p>
                    </div>
                  );
                }}
              />
              <Legend />
              <Bar dataKey="positive" fill="#10b981" name="Positive" stackId="mix" />
              <Bar dataKey="negative" fill="#ef4444" name="Negative" stackId="mix" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="w-full space-y-6 pb-10">
      {pendingAiSentimentCount > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {pendingAiSentimentCount} submission(s) have no AI sentiment yet. Enable OpenRouter on the
          API server to classify comments.
        </p>
      )}

      <div className="space-y-8">
        {periodFilterBar}
        {kpiRow}
        {actionRequiredCard}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 size={20} className="text-[#2A6FDB]" />
            Department & service sentiment
          </h2>
          {deptServiceMixedChart}
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Volume & trends</h2>
            <p className="text-xs text-muted-foreground">
              {filteredTotal} submission(s) in range · {timeSlotLabel(timeFilter)}
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl shadow-sm border border-gray-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Submission volume</CardTitle>
                <CardDescription>
                  {periodFilter === "weekly"
                    ? "One point per week in range"
                    : periodFilter === "daily"
                      ? "One point per day in range"
                      : "One point per month in range"}{" "}
                  · {periodLabel}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {volumeChartData.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-12 text-center">
                    No submissions for this period and time filter.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={volumeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
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
            <Card className="rounded-2xl shadow-sm border border-gray-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Sentiment trend</CardTitle>
                <CardDescription>Positive, neutral, negative — same period as volume</CardDescription>
              </CardHeader>
              <CardContent>
                {sentimentChartData.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-12 text-center">No sentiment data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={sentimentChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
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
                <CardDescription>Hour submitted (24h clock) · {periodLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredTotal === 0 ? (
                  <p className="text-muted-foreground text-sm py-12 text-center">No data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={submissionsByHour}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8B5CF6" name="Submissions" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm border border-gray-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Volume by department (EMR)</CardTitle>
                <CardDescription>Share in selected period · {periodLabel}</CardDescription>
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
    </div>
  );
}

/** @deprecated Use InsightsDashboard — kept for route compatibility */
export function ManagementDashboard() {
  return <InsightsDashboard />;
}
