import { RefreshCw } from "lucide-react";
import {
  hasCustomDateRange,
  isDefaultPresetRange,
  periodDescription,
  rangesEqual,
  thisMonthRange,
  thisWeekRange,
  type PeriodGranularity,
  type TimeOfDaySlot,
} from "../../lib/insightsFilters";
import type { InsightsDataState } from "./useInsightsData";
import { Card, CardContent } from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type Props = Pick<
  InsightsDataState,
  | "periodFilter"
  | "setPeriodFilter"
  | "timeFilter"
  | "setTimeFilter"
  | "customFrom"
  | "setCustomFrom"
  | "customTo"
  | "setCustomTo"
  | "customRange"
  | "applyRange"
  | "clearRange"
  | "loadData"
  | "isLoading"
>;

export function InsightsPeriodFilterBar(props: Props) {
  const {
    periodFilter,
    setPeriodFilter,
    timeFilter,
    setTimeFilter,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    customRange,
    applyRange,
    clearRange,
    loadData,
    isLoading,
  } = props;

  const periodLabel = periodDescription(periodFilter, timeFilter, customRange);
  const usingCustomRange = hasCustomDateRange(customRange);

  const presetChipClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
      active
        ? "bg-[#2A6FDB] text-white shadow-sm"
        : "border border-gray-200 bg-white text-gray-700 hover:border-[#2A6FDB]/40"
    }`;

  const onGranularityChange = (id: PeriodGranularity) => {
    setPeriodFilter(id);
    clearRange();
  };

  return (
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
                  onClick={() => onGranularityChange(opt.id)}
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
}
