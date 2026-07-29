import { Feedback, SummaryReport } from "./models.js";
import { analyticsSlicesFromFeedback } from "./feedbackSlices.js";
import { synthesizeSummaryReport } from "./openRouterAnalysis.js";

const MAX_SUMMARIES_PER_GROUP = 50;
const MAX_TOPICS_PER_GROUP = 5;

function emptyGroup() {
  return {
    feedbackCount: 0,
    sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
    docIds: new Set(),
  };
}

function bumpSentiment(group, sentiment) {
  group.feedbackCount += 1;
  if (group.sentimentCounts[sentiment] != null) group.sentimentCounts[sentiment] += 1;
}

function periodLabelFor(periodType, periodKey) {
  return periodType === "weekly" ? `Week of ${periodKey}` : periodKey;
}

/**
 * Doc-level stats (urgency/rating/topics) for a group, deduped by feedback _id — covers all
 * sentiments for full-picture context. `negativeSummaries` (the narrative input) is filtered to
 * negative-sentiment feedback only, most recent first.
 */
function topTopicsFromCounts(topicCounts) {
  return [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TOPICS_PER_GROUP);
}

function docStats(group, rowsById) {
  const urgencyCounts = { low: 0, medium: 0, high: 0 };
  const topicCounts = new Map();
  const negativeTopicCounts = new Map();
  let ratingSum = 0;
  let ratingCount = 0;
  const negativeCandidates = [];

  for (const id of group.docIds) {
    const row = rowsById.get(id);
    if (!row) continue;
    if (urgencyCounts[row.aiUrgency] != null) urgencyCounts[row.aiUrgency] += 1;
    if (Number.isFinite(row.rating)) {
      ratingSum += row.rating;
      ratingCount += 1;
    }
    const isNegative = row.aiSentiment === "negative";
    for (const topic of row.aiTopics || []) {
      const key = String(topic).trim();
      if (!key) continue;
      topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
      if (isNegative) negativeTopicCounts.set(key, (negativeTopicCounts.get(key) || 0) + 1);
    }
    const text = String(row.aiSummary || "").trim();
    if (text && isNegative) {
      negativeCandidates.push({ text, createdAt: row.createdAt });
    }
  }

  const orderedNegativeSummaries = [...negativeCandidates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    averageRating: ratingCount ? Number((ratingSum / ratingCount).toFixed(1)) : 0,
    urgencyCounts,
    /** All-sentiment topics — stored/displayed for full-picture context. */
    topTopics: topTopicsFromCounts(topicCounts),
    /** Negative-only topics — fed to the narrative prompt so it can't reference praise topics. */
    negativeTopTopics: topTopicsFromCounts(negativeTopicCounts),
    allNegativeSummaries: orderedNegativeSummaries,
    cappedNegativeSummaries: orderedNegativeSummaries
      .slice(0, MAX_SUMMARIES_PER_GROUP)
      .map((s) => s.text),
  };
}

/**
 * Recomputes and upserts SummaryReport rows (one per department, one per service) for a period.
 * @param {{ periodType: "weekly"|"monthly", periodKey: string, periodStart: Date, periodEnd: Date }} params
 * @returns {Promise<{ departments: number, services: number }>}
 */
export async function generateSummaryReports({ periodType, periodKey, periodStart, periodEnd }) {
  const rows = await Feedback.find({
    createdAt: { $gte: periodStart, $lte: periodEnd },
  }).lean();

  const rowsById = new Map(rows.map((row) => [String(row._id), row]));
  const deptGroups = new Map();
  const svcGroups = new Map();

  for (const row of rows) {
    const id = String(row._id);
    for (const slice of analyticsSlicesFromFeedback(row)) {
      if (slice.department) {
        const g = deptGroups.get(slice.department) || emptyGroup();
        bumpSentiment(g, slice.sentiment);
        g.docIds.add(id);
        deptGroups.set(slice.department, g);
      }
      if (slice.service) {
        const g = svcGroups.get(slice.service) || emptyGroup();
        bumpSentiment(g, slice.sentiment);
        g.docIds.add(id);
        svcGroups.set(slice.service, g);
      }
    }
  }

  const periodLabel = periodLabelFor(periodType, periodKey);

  async function persistGroup(groupType, groupName, group) {
    const stats = docStats(group, rowsById);
    const narrative = await synthesizeSummaryReport({
      groupLabel: groupName,
      periodLabel,
      stats: {
        sentimentCounts: group.sentimentCounts,
        urgencyCounts: stats.urgencyCounts,
        topTopics: stats.negativeTopTopics,
      },
      summaries: stats.cappedNegativeSummaries,
    });

    await SummaryReport.updateOne(
      { periodType, periodKey, groupType, groupName },
      {
        $set: {
          periodStart,
          periodEnd,
          feedbackCount: group.feedbackCount,
          sentimentCounts: group.sentimentCounts,
          averageRating: stats.averageRating,
          urgencyCounts: stats.urgencyCounts,
          topTopics: stats.topTopics,
          narrative,
          sourceSummaryCount: stats.allNegativeSummaries.length,
          generatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  for (const [name, group] of deptGroups) {
    await persistGroup("department", name, group);
  }
  for (const [name, group] of svcGroups) {
    await persistGroup("service", name, group);
  }

  // eslint-disable-next-line no-console
  console.log("[summary-report] generated", {
    periodType,
    periodKey,
    departments: deptGroups.size,
    services: svcGroups.size,
  });

  return { departments: deptGroups.size, services: svcGroups.size };
}
