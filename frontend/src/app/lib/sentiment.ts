import type { FeedbackItem } from "./api";

/** Groq-classified sentiment only; no fallback from star rating. */
export function getAiSentimentBucket(
  item: Pick<FeedbackItem, "aiSentiment">
): "positive" | "neutral" | "negative" | null {
  const s = item.aiSentiment;
  if (s === "positive" || s === "neutral" || s === "negative") return s;
  return null;
}
