import type { FeedbackItem } from "../../lib/api";
import { getAiSentimentBucket } from "../../lib/sentiment";

export type InsightsKpiKind =
  | "submissions"
  | "patients"
  | "positive"
  | "neutral"
  | "negative"
  | "follow-up";

export const KPI_LABELS: Record<InsightsKpiKind, string> = {
  submissions: "Submissions",
  patients: "Patients",
  positive: "Positive (AI)",
  neutral: "Neutral (AI)",
  negative: "Negative (AI)",
  "follow-up": "Needs follow-up",
};

export function matchesFollowUp(item: FeedbackItem): boolean {
  if (item.status === "Resolved") return false;
  if (item.aiUrgency === "high" || item.aiSentiment === "negative") return true;
  if (!item.aiAnalyzedAt && (item.rating ?? 0) <= 2) return true;
  return false;
}

export function rowsForKpi(kind: InsightsKpiKind, rows: FeedbackItem[]): FeedbackItem[] {
  switch (kind) {
    case "submissions":
      return rows;
    case "positive":
      return rows.filter((i) => getAiSentimentBucket(i) === "positive");
    case "neutral":
      return rows.filter((i) => getAiSentimentBucket(i) === "neutral");
    case "negative":
      return rows.filter((i) => getAiSentimentBucket(i) === "negative");
    case "follow-up":
      return rows.filter(matchesFollowUp);
    default:
      return rows;
  }
}

export function visitTypeLabel(encounterType: string | null | undefined): string {
  if (encounterType === "op") return "OP";
  if (encounterType === "ip") return "IP";
  return "Name only";
}
