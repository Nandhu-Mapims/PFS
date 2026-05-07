import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  MessageSquareWarning,
} from "lucide-react";
import { getFeedback, getFeedbackAnalytics, type FeedbackItem } from "../lib/api";
import { getAiSentimentBucket } from "../lib/sentiment";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function ManagementDashboard() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        const [feedbackRows] = await Promise.all([getFeedback(), getFeedbackAnalytics()]);
        setItems(feedbackRows);
      } catch {
        setError("Failed to load management dashboard.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadData();
  }, []);

  const totalFeedback = items.length;
  const positiveCount = items.filter((i) => getAiSentimentBucket(i) === "positive").length;
  const neutralCount = items.filter((i) => getAiSentimentBucket(i) === "neutral").length;
  const negativeCount = items.filter((i) => getAiSentimentBucket(i) === "negative").length;
  const pendingAiSentimentCount = items.filter((i) => getAiSentimentBucket(i) === null).length;
  const criticalCount = items.filter((i) => {
    if (i.status === "Resolved") return false;
    if (i.aiUrgency === "high" || i.aiSentiment === "negative") return true;
    if (!i.aiAnalyzedAt && (i.rating ?? 0) <= 2) return true;
    return false;
  }).length;

  const pct = (value: number) =>
    totalFeedback ? `${((value / totalFeedback) * 100).toFixed(1)}% of total` : "0.0% of total";

  const trendData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const row of items) {
      const d = new Date(row.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth[key] = (byMonth[key] || 0) + 1;
    }
    return Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-4)
      .map(([month, feedback]) => ({ month, feedback }));
  }, [items]);

  const departmentData = useMemo(() => {
    const palette = ["#2A6FDB", "#2FBF71", "#8B5CF6", "#F4A261", "#E5533D", "#6B7280"];
    const byDept: Record<string, number> = {};
    for (const row of items) {
      const key = row.department || "Unspecified";
      byDept[key] = (byDept[key] || 0) + 1;
    }
    return Object.entries(byDept)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], index) => ({
        name,
        value,
        color: palette[index % palette.length],
      }));
  }, [items]);

  const feedbackData = useMemo(() => {
    const byDay: Record<string, { positive: number; neutral: number; negative: number }> = {};
    const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short" });
    for (const row of items) {
      const key = dayLabel(new Date(row.createdAt));
      if (!byDay[key]) byDay[key] = { positive: 0, neutral: 0, negative: 0 };
      const bucket = getAiSentimentBucket(row);
      if (bucket === "positive") byDay[key].positive += 1;
      else if (bucket === "neutral") byDay[key].neutral += 1;
      else if (bucket === "negative") byDay[key].negative += 1;
    }
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return order
      .filter((day) => byDay[day])
      .map((day) => ({ name: day, ...byDay[day] }));
  }, [items]);

  const categoryData = useMemo(() => {
    const categoryRules = [
      { category: "Wait Time", terms: ["wait", "delay", "long time", "queue"] },
      { category: "Staff Behavior", terms: ["staff", "rude", "nurse", "attitude"] },
      { category: "Cleanliness", terms: ["clean", "dirty", "hygiene"] },
      { category: "Treatment Quality", terms: ["doctor", "treatment", "care", "diagnosis"] },
      { category: "Billing", terms: ["bill", "charge", "payment", "cost"] },
    ];
    const counts: Record<string, number> = Object.fromEntries(
      categoryRules.map((r) => [r.category, 0])
    );
    for (const row of items) {
      const text = (row.comments || "").toLowerCase();
      for (const rule of categoryRules) {
        if (rule.terms.some((term) => text.includes(term))) {
          counts[rule.category] += 1;
        }
      }
    }
    return categoryRules.map((r) => ({ category: r.category, count: counts[r.category] || 0 }));
  }, [items]);

  const topIssues = [...categoryData].sort((a, b) => b.count - a.count).slice(0, 3);
  const highComplaintDepartments = [...departmentData]
    .filter((d) => {
      const rows = items.filter((i) => (i.department || "Unspecified") === d.name);
      return rows.some((r) => getAiSentimentBucket(r) === "negative");
    })
    .slice(0, 3);
  const topPerforming = [...departmentData]
    .map((d) => {
      const rows = items.filter((i) => (i.department || "Unspecified") === d.name);
      const positive = rows.filter((r) => getAiSentimentBucket(r) === "positive").length;
      const ratio = rows.length ? Math.round((positive / rows.length) * 100) : 0;
      return { name: d.name, ratio };
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);

  if (isLoading) {
    return <p className="text-muted-foreground p-6">Loading management dashboard...</p>;
  }

  if (error) {
    return <p className="p-6 text-red-600">{error}</p>;
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Management Dashboard
        </h2>
        <p className="text-muted-foreground text-sm md:text-base">
          Sentiment breakdown uses Groq AI on comment text, not star ratings
        </p>
      </div>

      {pendingAiSentimentCount > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {pendingAiSentimentCount} submission(s) have no AI sentiment yet (Groq disabled or not run).
        </p>
      )}

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            Action Required - This Week
          </CardTitle>
          <CardDescription>Prioritized insights for operational follow-up</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle size={16} className="text-red-600" />
                Top Issues
              </h4>
              <ul className="space-y-2">
                {topIssues.map((issue) => (
                  <li key={issue.category} className="flex items-center justify-between text-sm">
                    <span>{issue.category}</span>
                    <Badge variant="outline">{issue.count}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Clock size={16} className="text-amber-600" />
                High Complaint Depts
              </h4>
              <ul className="space-y-2">
                {highComplaintDepartments.map((dept) => (
                  <li key={dept.name} className="flex items-center justify-between text-sm">
                    <span>{dept.name}</span>
                    <Badge variant="outline">{dept.value}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CheckCircle size={16} className="text-emerald-600" />
                Top Performing Areas
              </h4>
              <ul className="space-y-2">
                {topPerforming.map((dept) => (
                  <li key={dept.name} className="flex items-center justify-between text-sm">
                    <span>{dept.name}</span>
                    <span className="text-emerald-600 font-semibold">{dept.ratio}% positive</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase tracking-wide">
                Total Feedback
              </CardDescription>
              <TrendingUp size={16} className="text-blue-600" />
            </div>
            <CardTitle className="text-3xl">{totalFeedback}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="outline">Live from API</Badge>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">
              Positive (AI)
            </CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{positiveCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground pt-0 text-xs">{pct(positiveCount)}</CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">
              Neutral (AI)
            </CardDescription>
            <CardTitle className="text-3xl text-amber-600">{neutralCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground pt-0 text-xs">{pct(neutralCount)}</CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">
              Negative (AI)
            </CardDescription>
            <CardTitle className="text-3xl text-red-600">{negativeCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground pt-0 text-xs">{pct(negativeCount)}</CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase tracking-wide">Critical</CardDescription>
              <MessageSquareWarning size={16} className="text-red-600" />
            </div>
            <CardTitle className="text-3xl text-red-600">{criticalCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground pt-0 text-xs">Requires action</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Feedback Trend</CardTitle>
            <CardDescription>Last 4 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: "14px" }} />
                <YAxis stroke="#6b7280" style={{ fontSize: "14px" }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="feedback"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ fill: "#2563eb", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Department Breakdown</CardTitle>
            <CardDescription>Top contributors by volume</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={departmentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {departmentData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Weekly Sentiment Breakdown</CardTitle>
          <CardDescription>Positive, neutral, and negative feedback by weekday</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={feedbackData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "14px" }} />
              <YAxis stroke="#6b7280" style={{ fontSize: "14px" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="positive" fill="#10b981" name="Positive" radius={[8, 8, 0, 0]} />
              <Bar dataKey="neutral" fill="#f59e0b" name="Neutral" radius={[8, 8, 0, 0]} />
              <Bar dataKey="negative" fill="#ef4444" name="Negative" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Top Complaint Categories</CardTitle>
          <CardDescription>Most frequently mentioned topics in comments</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" stroke="#6b7280" style={{ fontSize: "14px" }} />
              <YAxis
                dataKey="category"
                type="category"
                stroke="#6b7280"
                style={{ fontSize: "14px" }}
                width={120}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

    </div>
  );
}
