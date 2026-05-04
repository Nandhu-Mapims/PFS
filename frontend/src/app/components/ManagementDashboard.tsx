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
import { TrendingUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { getFeedback, getFeedbackAnalytics, type FeedbackItem } from "../lib/api";
import { getAiSentimentBucket } from "../lib/sentiment";

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
    return <p className="p-6 text-gray-600">Loading management dashboard...</p>;
  }

  if (error) {
    return <p className="p-6 text-red-600">{error}</p>;
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
          Management Dashboard
        </h2>
        <p className="text-base md:text-lg text-gray-600">
          Sentiment breakdown uses Groq AI on comment text, not star ratings
        </p>
      </div>

      {pendingAiSentimentCount > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-6">
          {pendingAiSentimentCount} submission(s) have no AI sentiment yet (Groq disabled or not run).
        </p>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl p-6 shadow-md border-l-4 border-[#2A6FDB]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 text-sm font-medium">Total Feedback</p>
            <TrendingUp size={20} className="text-[#2A6FDB]" />
          </div>
          <p className="text-3xl font-bold text-gray-800">{totalFeedback}</p>
          <p className="text-sm text-[#2FBF71] mt-2 font-semibold">Live from API</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border-l-4 border-[#2FBF71]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[#2FBF71] text-sm font-bold">Positive (AI)</p>
            <span className="text-2xl">😊</span>
          </div>
          <p className="text-3xl font-bold text-[#2FBF71]">{positiveCount}</p>
          <p className="text-sm text-gray-600 mt-2">{pct(positiveCount)}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border-l-4 border-[#F4A261]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[#F4A261] text-sm font-bold">Neutral (AI)</p>
            <span className="text-2xl">😐</span>
          </div>
          <p className="text-3xl font-bold text-[#F4A261]">{neutralCount}</p>
          <p className="text-sm text-gray-600 mt-2">{pct(neutralCount)}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border-l-4 border-[#E5533D]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[#E5533D] text-sm font-bold">Negative (AI)</p>
            <span className="text-2xl">😟</span>
          </div>
          <p className="text-3xl font-bold text-[#E5533D]">{negativeCount}</p>
          <p className="text-sm text-gray-600 mt-2">{pct(negativeCount)}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border-l-4 border-[#E5533D]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[#E5533D] text-sm font-bold">Critical</p>
            <AlertTriangle size={20} className="text-[#E5533D]" />
          </div>
          <p className="text-3xl font-bold text-[#E5533D]">{criticalCount}</p>
          <p className="text-sm text-gray-600 mt-2">Requires action</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Feedback Trend */}
        <div className="bg-white rounded-xl p-6 shadow-md">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Feedback Trend (Last 4 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: "14px" }} />
                <YAxis stroke="#6b7280" style={{ fontSize: "14px" }} />
              <Tooltip
                contentStyle={{
                    backgroundColor: "#fff",
                    border: "2px solid #2A6FDB",
                    borderRadius: "0.75rem",
                    fontWeight: 600,
                  }}
              />
              <Line
                type="monotone"
                dataKey="feedback"
                stroke="#2A6FDB"
                strokeWidth={3}
                dot={{ fill: "#2A6FDB", r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Department Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-md">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            Department-wise Breakdown
          </h3>
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
        </div>
      </div>

      {/* Weekly Breakdown */}
      <div className="bg-white rounded-xl p-6 shadow-md mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Weekly Feedback Breakdown
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={feedbackData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "14px" }} />
            <YAxis stroke="#6b7280" style={{ fontSize: "14px" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "2px solid #2A6FDB",
                borderRadius: "0.75rem",
                fontWeight: 600,
              }}
            />
            <Legend />
            <Bar dataKey="positive" fill="#2FBF71" name="Positive" radius={[8, 8, 0, 0]} />
            <Bar dataKey="neutral" fill="#F4A261" name="Neutral" radius={[8, 8, 0, 0]} />
            <Bar dataKey="negative" fill="#E5533D" name="Negative" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Complaint Categories */}
      <div className="bg-white rounded-xl p-6 shadow-md mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Top Complaint Categories
        </h3>
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
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "2px solid #2A6FDB",
                borderRadius: "0.75rem",
                fontWeight: 600,
              }}
            />
            <Bar dataKey="count" fill="#2A6FDB" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* INSIGHTS PANEL - Action-Driven */}
      <div className="bg-gradient-to-r from-[#2A6FDB] to-[#2FBF71] rounded-xl p-1 shadow-lg">
        <div className="bg-white rounded-lg p-6">
          <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <AlertTriangle size={28} className="text-[#F4A261]" />
            Action Required - This Week
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Top Issues */}
            <div className="bg-[#F5F7FA] rounded-xl p-5 border-l-4 border-[#E5533D]">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle size={24} className="text-[#E5533D] flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-gray-800 text-lg mb-1">Top Issues This Week</h4>
                  <p className="text-sm text-gray-600 mb-3">Immediate attention needed</p>
                </div>
              </div>
              <ul className="space-y-2">
                {topIssues.map((issue, index) => (
                  <li key={issue.category} className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        index === 0 ? "bg-[#E5533D]" : "bg-[#F4A261]"
                      }`}
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {issue.category} ({issue.count})
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Departments with Highest Complaints */}
            <div className="bg-[#F5F7FA] rounded-xl p-5 border-l-4 border-[#F4A261]">
              <div className="flex items-start gap-3 mb-3">
                <Clock size={24} className="text-[#F4A261] flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-gray-800 text-lg mb-1">High Complaint Departments</h4>
                  <p className="text-sm text-gray-600 mb-3">Focus areas for improvement</p>
                </div>
              </div>
              <ul className="space-y-2">
                {highComplaintDepartments.map((dept, index) => (
                  <li key={dept.name} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{dept.name}</span>
                    <span
                      className={`px-2 py-1 text-white text-xs rounded-full font-bold ${
                        index === 0 ? "bg-[#E5533D]" : "bg-[#F4A261]"
                      }`}
                    >
                      {dept.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Positive Highlights */}
            <div className="bg-[#F5F7FA] rounded-xl p-5 border-l-4 border-[#2FBF71]">
              <div className="flex items-start gap-3 mb-3">
                <CheckCircle size={24} className="text-[#2FBF71] flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-gray-800 text-lg mb-1">Top Performing Areas</h4>
                  <p className="text-sm text-gray-600 mb-3">Keep up the good work</p>
                </div>
              </div>
              <ul className="space-y-2">
                {topPerforming.map((dept) => (
                  <li key={dept.name} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{dept.name}</span>
                    <span className="text-xs font-bold text-[#2FBF71]">{dept.ratio}% positive</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Recommendations */}
          <div className="mt-6 bg-gradient-to-r from-[#2A6FDB] bg-opacity-5 to-[#2FBF71] bg-opacity-5 rounded-xl p-5 border border-[#2A6FDB] border-opacity-30">
            <h4 className="font-bold text-gray-800 mb-3 text-lg">Recommended Actions</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button className="flex items-center gap-3 bg-white p-4 rounded-lg border-2 border-[#2A6FDB] hover:bg-[#2A6FDB] hover:text-white transition-all group text-left">
                <Clock size={20} className="text-[#2A6FDB] group-hover:text-white" />
                <span className="font-semibold text-sm">Review Emergency wait times</span>
              </button>
              <button className="flex items-center gap-3 bg-white p-4 rounded-lg border-2 border-[#2FBF71] hover:bg-[#2FBF71] hover:text-white transition-all group text-left">
                <CheckCircle size={20} className="text-[#2FBF71] group-hover:text-white" />
                <span className="font-semibold text-sm">Schedule staff training session</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
