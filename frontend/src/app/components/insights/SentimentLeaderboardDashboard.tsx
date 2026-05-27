import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Award,
  Building2,
  Layers,
  Minus,
  Split,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { FeedbackItem } from "../../lib/api";
import {
  buildDepartmentSentimentLeaderboard,
  buildServiceSentimentLeaderboard,
  collectSentimentSlices,
  sortByNegative,
  sortByPositive,
  type SentimentLeaderboardRow,
} from "../../lib/insightsSentimentSlices";
import { periodDescription, timeSlotLabel } from "../../lib/insightsFilters";
import type { InsightsDataState } from "./useInsightsData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

type Props = Pick<
  InsightsDataState,
  "filteredByPeriod" | "periodFilter" | "timeFilter" | "customRange"
>;

const RANK_STYLES = [
  "from-amber-400 to-amber-600 text-white",
  "from-slate-400 to-slate-600 text-white",
  "from-orange-400 to-orange-600 text-white",
];

function SummaryTile({
  label,
  value,
  sub,
  gradient,
  icon,
}: {
  label: string;
  value: number;
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

function StackedBar({ row }: { row: SentimentLeaderboardRow }) {
  const total = row.total || 1;
  const posW = (row.positive / total) * 100;
  const neuW = (row.neutral / total) * 100;
  const negW = (row.negative / total) * 100;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
      {posW > 0 && (
        <div className="bg-emerald-500 transition-all" style={{ width: `${posW}%` }} title="Positive" />
      )}
      {neuW > 0 && (
        <div className="bg-amber-400 transition-all" style={{ width: `${neuW}%` }} title="Neutral" />
      )}
      {negW > 0 && (
        <div className="bg-red-500 transition-all" style={{ width: `${negW}%` }} title="Negative" />
      )}
    </div>
  );
}

function RankCard({
  rank,
  row,
  tone,
}: {
  rank: number;
  row: SentimentLeaderboardRow;
  tone: "positive" | "negative";
}) {
  const medal = rank <= 3 ? RANK_STYLES[rank - 1] : "";
  const pct = tone === "positive" ? row.positivePct : row.negativePct;
  const count = tone === "positive" ? row.positive : row.negative;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
            medal ? `bg-gradient-to-br ${medal}` : "bg-gray-100 text-gray-700"
          }`}
        >
          #{rank}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{row.name}</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-gray-900">
            {pct}%
            <span className="text-sm font-normal text-muted-foreground ml-1">
              ({count} {tone})
            </span>
          </p>
          <div className="mt-2">
            <StackedBar row={row} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-muted-foreground">
            <span className="text-emerald-600">+{row.positive}</span>
            <span className="text-amber-600">~{row.neutral}</span>
            <span className="text-red-600">−{row.negative}</span>
            {row.splitCount > 0 ? (
              <Badge variant="outline" className="text-[10px] py-0 h-5 gap-1">
                <Split size={10} />
                {row.splitCount} split
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardColumn({
  title,
  subtitle,
  icon,
  topPositive,
  topNegative,
  chartData,
  showAllLabel,
  showAll,
  onShowAllChange,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  topPositive: SentimentLeaderboardRow[];
  topNegative: SentimentLeaderboardRow[];
  chartData: SentimentLeaderboardRow[];
  showAllLabel: string;
  showAll: boolean;
  onShowAllChange: (v: boolean) => void;
}) {
  const chartHeight = Math.min(900, Math.max(280, chartData.length * 36));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
            <TrendingUp size={16} />
            Most positive
          </h3>
          {topPositive.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data in range.</p>
          ) : (
            topPositive.map((row, i) => (
              <RankCard key={row.name} rank={i + 1} row={row} tone="positive" />
            ))
          )}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <TrendingDown size={16} />
            Most negative
          </h3>
          {topNegative.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data in range.</p>
          ) : (
            topNegative.map((row, i) => (
              <RankCard key={row.name} rank={i + 1} row={row} tone="negative" />
            ))
          )}
        </div>
      </div>

      <Card className="rounded-2xl border border-gray-100 shadow-sm">
        <CardHeader className="pb-2 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Comparison chart</CardTitle>
              <CardDescription>
                {showAll ? "All rows in period" : "Top 10 by volume"} · stacked positive · neutral ·
                negative
              </CardDescription>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 shrink-0">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={showAll}
                onChange={(e) => onShowAllChange(e.target.checked)}
              />
              <span>{showAllLabel}</span>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No data.</p>
          ) : (
            <div
              className={showAll && chartData.length > 12 ? "max-h-[min(70vh,640px)] overflow-y-auto pr-1" : ""}
            >
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="positive" stackId="s" fill="#10b981" name="Positive" />
                  <Bar dataKey="neutral" stackId="s" fill="#fbbf24" name="Neutral" />
                  <Bar dataKey="negative" stackId="s" fill="#ef4444" name="Negative" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SentimentLeaderboardDashboard({
  filteredByPeriod,
  periodFilter,
  timeFilter,
  customRange,
}: Props) {
  const periodLabel = periodDescription(periodFilter, timeFilter, customRange);
  const [showAllDepartments, setShowAllDepartments] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);

  const slices = useMemo(
    () => collectSentimentSlices(filteredByPeriod),
    [filteredByPeriod]
  );

  const deptRows = useMemo(() => buildDepartmentSentimentLeaderboard(slices), [slices]);
  const svcRows = useMemo(() => buildServiceSentimentLeaderboard(slices), [slices]);

  const totals = useMemo(() => {
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    let split = 0;
    for (const s of slices) {
      if (s.sentiment === "positive") positive += 1;
      else if (s.sentiment === "neutral") neutral += 1;
      else negative += 1;
      if (s.isSplitChild) split += 1;
    }
    return { positive, neutral, negative, total: slices.length, split };
  }, [slices]);

  const deptTopPos = sortByPositive(deptRows).filter((r) => r.positive > 0).slice(0, 5);
  const deptTopNeg = sortByNegative(deptRows).filter((r) => r.negative > 0).slice(0, 5);
  const svcTopPos = sortByPositive(svcRows).filter((r) => r.positive > 0).slice(0, 5);
  const svcTopNeg = sortByNegative(svcRows).filter((r) => r.negative > 0).slice(0, 5);

  const deptChart = showAllDepartments ? deptRows : deptRows.slice(0, 10);
  const svcChart = showAllServices ? svcRows : svcRows.slice(0, 10);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Each issue and split ticket is one slice with its own sentiment. {periodLabel} ·{" "}
        {timeSlotLabel(timeFilter)}
        {totals.split > 0 ? (
          <span className="text-violet-800">
            {" "}
            · {totals.split} slice(s) from split tickets.
          </span>
        ) : null}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Positive"
          value={totals.positive}
          sub={`${totals.total ? Math.round((totals.positive / totals.total) * 100) : 0}% of slices`}
          gradient="from-emerald-500 to-emerald-700"
          icon={<ThumbsUp size={22} className="opacity-90" />}
        />
        <SummaryTile
          label="Neutral"
          value={totals.neutral}
          sub={`${totals.total ? Math.round((totals.neutral / totals.total) * 100) : 0}% of slices`}
          gradient="from-amber-400 to-amber-600"
          icon={<Minus size={22} className="opacity-90" />}
        />
        <SummaryTile
          label="Negative"
          value={totals.negative}
          sub={`${totals.total ? Math.round((totals.negative / totals.total) * 100) : 0}% of slices`}
          gradient="from-red-500 to-red-700"
          icon={<ThumbsDown size={22} className="opacity-90" />}
        />
        <SummaryTile
          label="Total slices"
          value={totals.total}
          sub={`${deptRows.length} depts · ${svcRows.length} services`}
          gradient="from-[#2A6FDB] to-blue-800"
          icon={<Award size={22} className="opacity-90" />}
        />
      </div>

      <div className="grid gap-10 xl:grid-cols-2">
        <LeaderboardColumn
          title="Departments"
          subtitle="AI routing department per issue / split ticket"
          icon={<Building2 size={22} className="text-[#2A6FDB]" />}
          topPositive={deptTopPos}
          topNegative={deptTopNeg}
          chartData={deptChart}
          showAllLabel="Show all department scores"
          showAll={showAllDepartments}
          onShowAllChange={setShowAllDepartments}
        />
        <LeaderboardColumn
          title="Services"
          subtitle="Mapped TMS service per slice (unmapped skipped)"
          icon={<Layers size={22} className="text-teal-600" />}
          topPositive={svcTopPos}
          topNegative={svcTopNeg}
          chartData={svcChart}
          showAllLabel="Show all service scores"
          showAll={showAllServices}
          onShowAllChange={setShowAllServices}
        />
      </div>
    </div>
  );
}
