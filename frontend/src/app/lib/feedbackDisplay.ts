import type { FeedbackItem } from "./api";
import { ticketService } from "./ticketFilters";

export type EffectiveFeedbackMode = "bot" | "voice" | "standard";

/** Split-issue rows often omit submissionMode; inherit from a sibling in the same group. */
export function effectiveFeedbackMode(
  item: FeedbackItem,
  groupItems?: FeedbackItem[]
): EffectiveFeedbackMode {
  if (item.submissionMode === "bot") return "bot";
  if (groupItems?.length) {
    const botSibling = groupItems.find(
      (row) => row.submissionMode === "bot" || (row.botConversationAnswers?.length ?? 0) > 0
    );
    if (item.isSplitChild && botSibling) return "bot";
  }
  if (
    item.submissionMode === "voice" ||
    Boolean(item.voiceRecordingUrl || item.voiceRecordingRelPath)
  ) {
    return "voice";
  }
  return item.submissionMode ?? "standard";
}

/** Per-service sentiment when AI split issues; else row-level aiSentiment. */
export function displaySentimentForItem(item: FeedbackItem): FeedbackItem["aiSentiment"] | null {
  const svc = ticketService(item);
  if (svc && item.feedbackIssues?.length) {
    const match = item.feedbackIssues.find(
      (issue) =>
        issue.recommendedService?.trim().toLowerCase() === svc.trim().toLowerCase() && issue.sentiment
    );
    if (match?.sentiment) return match.sentiment;
  }
  return item.aiSentiment ?? null;
}

export function childModeShortLabel(
  item: FeedbackItem,
  groupItems?: FeedbackItem[]
): string {
  const mode = effectiveFeedbackMode(item, groupItems);
  if (mode === "bot") return "Bot";
  if (mode === "voice") return "Voice";
  return "Typed";
}

export const feedbackModeLabel: Record<EffectiveFeedbackMode, string> = {
  bot: "AI Voice Guide (Tamil Q&A)",
  voice: "Voice feedback",
  standard: "Typed feedback",
};

/** One-line summary for this ticket when feedback was split into multiple issues. */
export function ticketAiSummaryForItem(item: FeedbackItem): string {
  const overall = item.aiSummary?.trim() || "";
  if (!item.isSplitChild) return overall;
  const svc = ticketService(item);
  const issue = item.feedbackIssues?.find(
    (row) =>
      row.recommendedService?.trim().toLowerCase() === svc.trim().toLowerCase() &&
      row.issueSummary?.trim()
  );
  return issue?.issueSummary?.trim() || overall;
}
