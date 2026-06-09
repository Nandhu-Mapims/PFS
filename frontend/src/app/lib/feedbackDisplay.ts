import type { FeedbackItem } from "./api";
import { sentimentFromRating } from "./sentiment";
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
  if (item.isSplitChild) {
    const s = item.aiSentiment;
    if (s === "positive" || s === "neutral" || s === "negative") return s;
  }
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

/** One-line AI summary stored on this feedback row (per split ticket when applicable). */
export function ticketAiSummaryForItem(item: FeedbackItem): string {
  return item.aiSummary?.trim() || "";
}

/** Short lines for overview table — one per split ticket or single summary. */
/** Overview table action — open detail to read transcript and play audio when available. */
export function overviewViewActionLabel(
  item: FeedbackItem,
  groupItems?: FeedbackItem[]
): string {
  if ((item.botConversationAnswers?.length ?? 0) > 0) return "View & listen";
  if (effectiveFeedbackMode(item, groupItems) === "voice") return "View & listen";
  return "View";
}

/** One-line preview for Recent feedback — AI summary when ready, else full transcript. */
export function groupOverviewSummaryLine(
  rep: FeedbackItem,
  groupItems: FeedbackItem[]
): string {
  const summaryLines = ticketSummariesForDisplay(groupItems);
  if (summaryLines.length > 1) {
    return (
      summaryLines.slice(0, 3).join(" · ") + (summaryLines.length > 3 ? "…" : "")
    );
  }
  const ai = rep.aiSummary?.trim();
  if (ai) return ai;
  const comments = rep.comments?.trim();
  if (comments) return comments;
  return "—";
}

export function ticketSummariesForDisplay(items: FeedbackItem[]): string[] {
  const split = items.filter((i) => i.isSplitChild);
  if (split.length) {
    return split
      .map((i) => ticketAiSummaryForItem(i))
      .filter(Boolean);
  }
  const rep = items.find((i) => !i.isSplitChild) ?? items[0];
  const one = rep ? ticketAiSummaryForItem(rep) : "";
  return one ? [one] : [];
}

function sentimentForGroupDisplay(
  item: FeedbackItem
): FeedbackItem["aiSentiment"] | null {
  const ai = displaySentimentForItem(item);
  if (ai) return ai;
  return sentimentFromRating(item.rating);
}

export function groupSentimentLabel(items: FeedbackItem[]): FeedbackItem["aiSentiment"] | "mixed" | null {
  const set = new Set(
    items
      .map((i) => sentimentForGroupDisplay(i))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
  );
  const botParent =
    items.find((i) => !i.isSplitChild && (i.botConversationAnswers?.length ?? 0) > 0) ??
    items.find((i) => (i.botConversationAnswers?.length ?? 0) > 0);
  for (const row of botParent?.botConversationAnswers ?? []) {
    const s = row.answerSentiment;
    if (s === "positive" || s === "neutral" || s === "negative") set.add(s);
  }
  if (set.size === 0) return null;
  if (set.size > 1) return "mixed";
  return [...set][0] ?? null;
}

export function botSessionParent(items: FeedbackItem[]): FeedbackItem | null {
  return (
    items.find((i) => !i.isSplitChild && (i.botConversationAnswers?.length ?? 0) > 0) ??
    items.find((i) => (i.botConversationAnswers?.length ?? 0) > 0) ??
    null
  );
}
