import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedbackItem } from "../../lib/api";
import {
  fetchFeedbackChanges,
  fetchFeedbackList,
  mergeFeedbackLists,
} from "../../lib/feedbackListSync";
import {
  feedbackCacheKey,
  getFeedbackCache,
  patchFeedbackCache,
  setFeedbackCache,
} from "../../lib/feedbackCache";
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodGranularity>("weekly");
  const [timeFilter, setTimeFilter] = useState<TimeOfDaySlot>("all");
  const [encounterFilter, setEncounterFilter] = useState<EncounterTypeFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const activeKeyRef = useRef("");

  const customRange = useMemo(
    () => ({ from: customFrom, to: customTo }),
    [customFrom, customTo]
  );

  const filterWindow = useMemo(
    () => resolveFilterWindow(periodFilter, customRange),
    [periodFilter, customFrom, customTo, customRange]
  );

  const listQuery = useMemo(
    () => ({
      lite: true as const,
      startMs: filterWindow.start.getTime(),
      endMs: filterWindow.end.getTime(),
      encounter: encounterFilter,
    }),
    [filterWindow, encounterFilter]
  );

  const cacheKey = useMemo(() => feedbackCacheKey(listQuery), [listQuery]);

  const loadData = useCallback(
    async (opts?: { silent?: boolean; incremental?: boolean }) => {
      const key = feedbackCacheKey(listQuery);
      activeKeyRef.current = key;

      const cached = getFeedbackCache(key);
      const useIncremental = Boolean(
        opts?.incremental && cached && cached.lastSyncMs > 0
      );

      try {
        if (useIncremental) {
          setIsRefreshing(true);
          const changes = await fetchFeedbackChanges(listQuery, cached!.lastSyncMs);
          if (activeKeyRef.current !== key) return;
          if (changes.length) {
            const merged = mergeFeedbackLists(cached!.items, changes);
            setItems(merged);
            patchFeedbackCache(key, merged, Date.now());
          } else {
            patchFeedbackCache(key, cached!.items, Date.now());
          }
          return;
        }

        if (cached && !opts?.silent) {
          setItems(cached.items);
          setIsLoading(false);
        } else if (!cached) {
          setIsLoading(true);
        }

        if (!opts?.silent) setError(null);

        const feedbackRows = await fetchFeedbackList(listQuery);
        if (activeKeyRef.current !== key) return;
        setItems(feedbackRows);
        setFeedbackCache(key, feedbackRows, Date.now());
      } catch {
        if (!cached) {
          setError("Failed to load insights. Check that the API and database are running.");
        }
      } finally {
        if (activeKeyRef.current === key) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [listQuery]
  );

  useEffect(() => {
    const cached = getFeedbackCache(cacheKey);
    if (cached) {
      setItems(cached.items);
      setIsLoading(false);
      void loadData({ silent: true, incremental: true });
      return;
    }
    void loadData();
  }, [cacheKey, loadData]);

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
    isRefreshing,
    hasData: items.length > 0,
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
