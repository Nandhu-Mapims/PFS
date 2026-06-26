import type { FeedbackAnalytics } from "./api";

type AnalyticsCacheEntry = {
  data: FeedbackAnalytics;
  loadedAt: number;
};

let entry: AnalyticsCacheEntry | null = null;

export function getAnalyticsCache(): FeedbackAnalytics | null {
  return entry?.data ?? null;
}

export function setAnalyticsCache(data: FeedbackAnalytics): void {
  entry = { data, loadedAt: Date.now() };
}
