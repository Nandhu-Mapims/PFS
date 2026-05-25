import type { FeedbackItem } from "./api";
import { displaySentimentForItem } from "./feedbackDisplay";

/** AI-classified sentiment only; no fallback from star rating. */
export function getAiSentimentBucket(
  item: Pick<FeedbackItem, "aiSentiment"> | FeedbackItem
): "positive" | "neutral" | "negative" | null {
  const s =
    "feedbackIssues" in item && item.feedbackIssues
      ? displaySentimentForItem(item as FeedbackItem)
      : item.aiSentiment;
  if (s === "positive" || s === "neutral" || s === "negative") return s;
  return null;
}
