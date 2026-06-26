import type { FeedbackInsightsQuery, FeedbackItem } from "./api";

export type FeedbackCacheEntry = {
  items: FeedbackItem[];
  lastSyncMs: number;
  loadedAt: number;
};

const store = new Map<string, FeedbackCacheEntry>();

export function feedbackCacheKey(query: FeedbackInsightsQuery): string {
  return JSON.stringify({
    startMs: query.startMs ?? null,
    endMs: query.endMs ?? null,
    encounter: query.encounter ?? "all",
    lite: query.lite ? 1 : 0,
    assignedToUserId: query.assignedToUserId?.trim() || null,
  });
}

export function getFeedbackCache(key: string): FeedbackCacheEntry | undefined {
  return store.get(key);
}

export function setFeedbackCache(
  key: string,
  items: FeedbackItem[],
  lastSyncMs: number = Date.now()
): void {
  store.set(key, { items, lastSyncMs, loadedAt: Date.now() });
}

export function patchFeedbackCache(
  key: string,
  items: FeedbackItem[],
  lastSyncMs: number = Date.now()
): void {
  const existing = store.get(key);
  store.set(key, {
    items,
    lastSyncMs,
    loadedAt: existing?.loadedAt ?? Date.now(),
  });
}
