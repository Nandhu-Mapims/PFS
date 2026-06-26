import { useCallback, useEffect, useMemo, useState } from "react";
import { getFeedback, type FeedbackItem } from "../../lib/api";
import {
  feedbackRowsWithTicket,
  filterItemsInWindow,
  resolveFilterWindow,
  type CustomDateRange,
  type EncounterTypeFilter,
  type PeriodGranularity,
  type TimeOfDaySlot,
} from "../../lib/insightsFilters";

export function useInsightsData() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodGranularity>("weekly");
  const [timeFilter, setTimeFilter] = useState<TimeOfDaySlot>("all");
  const [encounterFilter, setEncounterFilter] = useState<EncounterTypeFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const customRange = useMemo(
    () => ({ from: customFrom, to: customTo }),
    [customFrom, customTo]
  );

  const filterWindow = useMemo(
    () => resolveFilterWindow(periodFilter, customRange),
    [periodFilter, customFrom, customTo, customRange]
  );

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const feedbackRows = await getFeedback({
        startMs: filterWindow.start.getTime(),
        endMs: filterWindow.end.getTime(),
        encounter: encounterFilter,
        lite: true,
      });
      setItems(feedbackRows);
    } catch {
      setError("Failed to load insights. Check that the API and database are running.");
    } finally {
      setIsLoading(false);
    }
  }, [filterWindow, encounterFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredByPeriod = useMemo(
    () => filterItemsInWindow(items, filterWindow, timeFilter, encounterFilter),
    [items, filterWindow, timeFilter, encounterFilter]
  );

  const submissionRows = useMemo(() => filteredByPeriod, [filteredByPeriod]);

  const ticketRows = useMemo(
    () => feedbackRowsWithTicket(filteredByPeriod),
    [filteredByPeriod]
  );

  const applyRange = (range: CustomDateRange) => {
    setCustomFrom(range.from);
    setCustomTo(range.to);
  };

  const clearRange = () => {
    setCustomFrom("");
    setCustomTo("");
  };

  return {
    isLoading,
    error,
    loadData,
    periodFilter,
    setPeriodFilter,
    timeFilter,
    setTimeFilter,
    encounterFilter,
    setEncounterFilter,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    customRange,
    filterWindow,
    filteredByPeriod,
    submissionRows,
    ticketRows,
    applyRange,
    clearRange,
  };
}

export type InsightsDataState = ReturnType<typeof useInsightsData>;
