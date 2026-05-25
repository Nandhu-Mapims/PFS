import {
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
} from "../lib/insightsFilters";

type SubmittedDateFilterBarProps = {
  periodFilter: PeriodGranularity;
  onPeriodFilterChange: (value: PeriodGranularity) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onClearRange: () => void;
  timeFilter?: TimeOfDaySlot;
  showAllTicketsPreset?: boolean;
  allTicketsActive?: boolean;
  onAllTickets?: () => void;
};

export function SubmittedDateFilterBar({
  periodFilter,
  onPeriodFilterChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onClearRange,
  timeFilter = "all",
  showAllTicketsPreset = false,
  allTicketsActive = false,
  onAllTickets,
}: SubmittedDateFilterBarProps) {
  const customRange: CustomDateRange = { from: customFrom, to: customTo };
  const usingCustomRange = hasCustomDateRange(customRange);
  const periodLabel = allTicketsActive
    ? "All tickets · no date filter"
    : periodDescription(periodFilter, timeFilter, customRange);

  const applyRange = (range: CustomDateRange) => {
    onCustomFromChange(range.from);
    onCustomToChange(range.to);
  };

  const presetChipClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
      active
        ? "bg-[#2A6FDB] text-white shadow-sm"
        : "border border-gray-200 bg-white text-gray-700 hover:border-[#2A6FDB]/40"
    }`;

  const handlePeriodChange = (id: PeriodGranularity) => {
    onPeriodFilterChange(id);
    onClearRange();
  };

  return (
    <div className="mb-4 rounded-xl border border-gray-100 bg-white shadow-sm px-4 py-4 sm:px-5 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Filter by submitted date</p>
          <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
        </div>
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
              onClick={() => handlePeriodChange(opt.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                !allTicketsActive && periodFilter === opt.id
                  ? "bg-[#2A6FDB] text-white shadow-sm"
                  : "text-gray-600 hover:bg-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-muted-foreground">
          {periodFilter === "weekly"
            ? "Filter tickets submitted in a week range."
            : periodFilter === "yearly"
              ? "Filter tickets submitted in a month range."
              : "Filter tickets submitted by day range."}
        </p>

        <div className="flex flex-wrap gap-2">
          {showAllTicketsPreset ? (
            <button
              type="button"
              className={presetChipClass(allTicketsActive)}
              onClick={() => onAllTickets?.()}
            >
              All tickets
            </button>
          ) : null}
          {periodFilter === "weekly" ? (
            <>
              <button
                type="button"
                className={presetChipClass(!allTicketsActive && rangesEqual(customRange, thisWeekRange()))}
                onClick={() => applyRange(thisWeekRange())}
              >
                This week
              </button>
              <button
                type="button"
                className={presetChipClass(
                  !allTicketsActive && isDefaultPresetRange(periodFilter, customRange)
                )}
                onClick={() => {
                  onClearRange();
                }}
              >
                Last 12 weeks
              </button>
            </>
          ) : periodFilter === "yearly" ? (
            <>
              <button
                type="button"
                className={presetChipClass(!allTicketsActive && rangesEqual(customRange, thisMonthRange()))}
                onClick={() => applyRange(thisMonthRange())}
              >
                This month
              </button>
              <button
                type="button"
                className={presetChipClass(
                  !allTicketsActive && isDefaultPresetRange(periodFilter, customRange)
                )}
                onClick={onClearRange}
              >
                Last 12 months
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={presetChipClass(!allTicketsActive && rangesEqual(customRange, thisWeekRange()))}
                onClick={() => applyRange(thisWeekRange())}
              >
                This week
              </button>
              <button
                type="button"
                className={presetChipClass(
                  !allTicketsActive && isDefaultPresetRange(periodFilter, customRange)
                )}
                onClick={onClearRange}
              >
                Last 30 days
              </button>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label htmlFor="submitted-from" className="text-xs font-medium text-gray-700">
              From
            </label>
            <input
              id="submitted-from"
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2A6FDB]"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label htmlFor="submitted-to" className="text-xs font-medium text-gray-700">
              To
            </label>
            <input
              id="submitted-to"
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2A6FDB]"
            />
          </div>
          {usingCustomRange && !allTicketsActive ? (
            <button
              type="button"
              onClick={onClearRange}
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
    </div>
  );
}

/** Apply date + optional time-of-day filter to rows with createdAt. */
export function filterBySubmittedDate<T extends { createdAt: string }>(
  rows: T[],
  opts: {
    dateFilterActive: boolean;
    periodFilter: PeriodGranularity;
    customFrom: string;
    customTo: string;
    timeFilter?: TimeOfDaySlot;
  }
): T[] {
  if (!opts.dateFilterActive) return rows;
  const window = resolveFilterWindow(opts.periodFilter, {
    from: opts.customFrom,
    to: opts.customTo,
  });
  return filterItemsInWindow(rows, window, opts.timeFilter ?? "all");
}
