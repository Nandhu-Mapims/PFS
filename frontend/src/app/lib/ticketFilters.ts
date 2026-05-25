import type { FeedbackItem } from "./api";
import { sanitizeOptionalLabel } from "./fieldSanitize";

export type TicketStatusFilter = "all" | "New" | "In Progress" | "Resolved" | "pending";
export type TicketSentimentFilter = "all" | "positive" | "neutral" | "negative";

export function ticketDepartment(item: FeedbackItem): string {
  return sanitizeOptionalLabel(item.lookupDepartment || item.department) || "";
}

/** Voice transcripts and AI mistakes must not appear as routing service names. */
export function isPlausibleServiceLabel(
  value: string | null | undefined,
  item?: FeedbackItem
): boolean {
  const s = sanitizeOptionalLabel(value);
  if (!s) return false;
  if (s.length > 80) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  if (item) {
    const comments = (item.comments || "").trim();
    if (comments && (s === comments || comments.includes(s) || s.includes(comments.slice(0, 60)))) {
      return false;
    }
  }
  return true;
}

export function ticketService(item: FeedbackItem): string {
  const issueServices = (item.feedbackIssues || [])
    .map((i) => sanitizeOptionalLabel(i.recommendedService))
    .filter((s) => isPlausibleServiceLabel(s, item));

  if (item.isSplitChild && issueServices[0]) {
    return issueServices[0];
  }

  if (issueServices.length === 1) {
    return issueServices[0];
  }

  if (issueServices.length > 1) {
    return issueServices[0];
  }

  const fromField = sanitizeOptionalLabel(item.service);
  if (isPlausibleServiceLabel(fromField, item)) {
    return fromField;
  }

  return "";
}

/** All routing services for one feedback row (split issues or single service). */
export function ticketServices(item: FeedbackItem): string[] {
  const fromIssues = (item.feedbackIssues || [])
    .map((i) => sanitizeOptionalLabel(i.recommendedService))
    .filter((s) => isPlausibleServiceLabel(s, item));
  if (fromIssues.length) return [...new Set(fromIssues)];

  const single = ticketService(item);
  return single ? [single] : [];
}

export function filterTicketsByDimensions(
  rows: FeedbackItem[],
  opts: {
    status: TicketStatusFilter;
    department: string;
    service: string;
    sentiment: TicketSentimentFilter;
  }
): FeedbackItem[] {
  return rows.filter((row) => {
    if (opts.status === "pending") {
      if (row.status === "Resolved") return false;
    } else if (opts.status !== "all" && row.status !== opts.status) {
      return false;
    }

    if (opts.department !== "all") {
      if (ticketDepartment(row) !== opts.department) return false;
    }

    if (opts.service !== "all") {
      if (ticketService(row) !== opts.service) return false;
    }

    if (opts.sentiment !== "all") {
      if (row.aiSentiment !== opts.sentiment) return false;
    }

    return true;
  });
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function buildFilterSummary(opts: {
  status: TicketStatusFilter;
  department: string;
  service: string;
  sentiment: TicketSentimentFilter;
  dateLabel: string;
}): string {
  const parts: string[] = [];
  if (opts.status === "pending") parts.push("Pending (New + In progress)");
  else if (opts.status !== "all") parts.push(opts.status);
  if (opts.department !== "all") parts.push(`Dept: ${opts.department}`);
  if (opts.service !== "all") parts.push(`Service: ${opts.service}`);
  if (opts.sentiment !== "all") parts.push(`AI: ${opts.sentiment}`);
  if (opts.dateLabel && !opts.dateLabel.startsWith("All tickets")) {
    parts.push(opts.dateLabel);
  }
  return parts.length ? parts.join(" · ") : "All tickets";
}
