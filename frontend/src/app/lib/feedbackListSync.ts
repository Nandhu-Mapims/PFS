import type { FeedbackItem } from "./api";
import { getFeedback, type FeedbackInsightsQuery } from "./api";

/** Overlap avoids missing rows if server/client clocks differ slightly. */
export const FEEDBACK_SYNC_OVERLAP_MS = 15_000;

export function mergeFeedbackLists(
  current: FeedbackItem[],
  changes: FeedbackItem[]
): FeedbackItem[] {
  if (!changes.length) return current;
  const map = new Map(current.map((row) => [row._id, row]));
  for (const row of changes) {
    map.set(row._id, row);
  }
  return [...map.values()].sort((a, b) => b._id.localeCompare(a._id));
}

export async function fetchFeedbackList(query: FeedbackInsightsQuery): Promise<FeedbackItem[]> {
  return getFeedback(query);
}

export async function fetchFeedbackChanges(
  query: FeedbackInsightsQuery,
  sinceMs: number
): Promise<FeedbackItem[]> {
  if (!Number.isFinite(sinceMs) || sinceMs <= 0) {
    return fetchFeedbackList(query);
  }
  const { startMs: _start, endMs: _end, ...rest } = query;
  return getFeedback({
    ...rest,
    sinceMs: Math.max(0, sinceMs - FEEDBACK_SYNC_OVERLAP_MS),
  });
}
