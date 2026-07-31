import { sanitizeOptionalLabel } from "./fieldSanitize.js";

/**
 * @param {any} item
 * @param {{ department?: string }} [issue]
 */
export function analyticsDepartmentFromFeedback(item, issue) {
  return sanitizeOptionalLabel(
    item.lookupDepartment || issue?.department || item.department
  );
}

/** True when a short topic tag plausibly refers to the same subject as an issue's own text. */
function topicMatchesIssueText(topic, issueText) {
  const words = String(topic || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (!words.length) return false;
  const text = String(issueText || "").toLowerCase();
  return words.some((w) => text.includes(w));
}

/**
 * Scope doc-level aiTopics to the issue(s) whose own issueSummary text mentions them — a
 * multi-issue submission (e.g. one complaint about food, another about housekeeping) should not
 * have every topic attributed to every issue's department/service. A topic matching no issue text
 * (paraphrase mismatch) is kept on all issues rather than dropped.
 */
function topicsPerIssue(topics, issues) {
  const all = Array.isArray(topics) ? topics.filter(Boolean) : [];
  if (!all.length || issues.length <= 1) return issues.map(() => all);
  return issues.map((issue) => {
    const matched = all.filter((t) => topicMatchesIssueText(t, issue.issueSummary));
    return matched.length ? matched : all;
  });
}

/** One slice per issue (or the whole row when it has no feedbackIssues[]). */
export function analyticsSlicesFromFeedback(item) {
  const docSentiment = item.aiSentiment;
  if (!["positive", "neutral", "negative"].includes(docSentiment)) return [];

  const lookupDept = analyticsDepartmentFromFeedback(item);
  const hasIssues = Array.isArray(item.feedbackIssues) && item.feedbackIssues.length > 0;
  const issueRows = hasIssues
    ? item.feedbackIssues
    : [
        {
          department: lookupDept,
          recommendedService: item.service,
          issueSummary: item.aiSummary || "",
          sentiment: docSentiment,
        },
      ];

  const topicsByIssue = topicsPerIssue(item.aiTopics, issueRows);

  return issueRows.map((issue, idx) => ({
    department: analyticsDepartmentFromFeedback(item, issue),
    service: sanitizeOptionalLabel(issue.recommendedService || item.service),
    sentiment: ["positive", "neutral", "negative"].includes(issue.sentiment)
      ? issue.sentiment
      : docSentiment,
    issueSummary: String(issue.issueSummary || "").trim(),
    topics: topicsByIssue[idx],
  }));
}

export function bumpCount(counter, key) {
  const k = sanitizeOptionalLabel(key);
  if (!k) return;
  counter[k] = (counter[k] || 0) + 1;
}

export function counterToSortedList(counter, keyName) {
  return Object.entries(counter)
    .map(([name, count]) => ({ [keyName]: name, count }))
    .sort((a, b) => b.count - a.count);
}
