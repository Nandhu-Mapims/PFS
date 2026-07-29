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

/** One slice per issue (or the whole row when it has no feedbackIssues[]). */
export function analyticsSlicesFromFeedback(item) {
  const sentiment = item.aiSentiment;
  if (!["positive", "neutral", "negative"].includes(sentiment)) return [];

  const lookupDept = analyticsDepartmentFromFeedback(item);
  const issueRows =
    Array.isArray(item.feedbackIssues) && item.feedbackIssues.length > 0
      ? item.feedbackIssues
      : [{ department: lookupDept, recommendedService: item.service }];

  return issueRows.map((issue) => ({
    department: analyticsDepartmentFromFeedback(item, issue),
    service: sanitizeOptionalLabel(issue.recommendedService || item.service),
    sentiment,
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
