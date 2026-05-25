import type { FeedbackItem } from "./api";
import { sanitizeOptionalLabel } from "./fieldSanitize";
import { getAiSentimentBucket } from "./sentiment";

export type DeptServiceChartRow = {
  rowKey: string;
  label: string;
  isDepartment: boolean;
  department: string;
  service: string | null;
  positive: number;
  negative: number;
};

type SentimentCounts = { positive: number; negative: number };

type DeptNode = {
  department: string;
  counts: SentimentCounts;
  services: Map<string, SentimentCounts>;
};

function departmentFromItem(item: FeedbackItem, issueDept?: string): string {
  return sanitizeOptionalLabel(
    item.lookupDepartment || issueDept || item.department
  );
}

function slicesFromFeedback(item: FeedbackItem): Array<{
  department: string;
  service: string;
  sentiment: "positive" | "negative";
}> {
  const sentiment = getAiSentimentBucket(item);
  if (sentiment !== "positive" && sentiment !== "negative") return [];

  const fallbackDept = departmentFromItem(item);
  const issueRows =
    Array.isArray(item.feedbackIssues) && item.feedbackIssues.length > 0
      ? item.feedbackIssues
      : [{ department: fallbackDept, recommendedService: item.service ?? "" }];

  const out: Array<{
    department: string;
    service: string;
    sentiment: "positive" | "negative";
  }> = [];

  for (const issue of issueRows) {
    const department = departmentFromItem(item, issue.department);
    const service = sanitizeOptionalLabel(issue.recommendedService || item.service);
    if (!department) continue;
    out.push({
      department,
      service: service || "Unassigned service",
      sentiment,
    });
  }
  return out;
}

function bumpCounts(target: SentimentCounts, sentiment: "positive" | "negative") {
  if (sentiment === "positive") target.positive += 1;
  else target.negative += 1;
}

const MAX_DEPARTMENTS = 8;
const MAX_SERVICES_PER_DEPT = 6;

/** Department rows with nested service rows for a single stacked bar chart. */
export function buildDeptServiceSentimentChartData(
  items: FeedbackItem[]
): DeptServiceChartRow[] {
  const deptMap = new Map<string, DeptNode>();

  for (const item of items) {
    for (const slice of slicesFromFeedback(item)) {
      let node = deptMap.get(slice.department);
      if (!node) {
        node = {
          department: slice.department,
          counts: { positive: 0, negative: 0 },
          services: new Map(),
        };
        deptMap.set(slice.department, node);
      }
      bumpCounts(node.counts, slice.sentiment);

      let svc = node.services.get(slice.service);
      if (!svc) {
        svc = { positive: 0, negative: 0 };
        node.services.set(slice.service, svc);
      }
      bumpCounts(svc, slice.sentiment);
    }
  }

  const sortedDepts = [...deptMap.values()].sort((a, b) => {
    const totalA = a.counts.positive + a.counts.negative;
    const totalB = b.counts.positive + b.counts.negative;
    return totalB - totalA;
  });

  const rows: DeptServiceChartRow[] = [];

  for (const dept of sortedDepts.slice(0, MAX_DEPARTMENTS)) {
    const deptTotal = dept.counts.positive + dept.counts.negative;
    rows.push({
      rowKey: `dept:${dept.department}`,
      label: dept.department,
      isDepartment: true,
      department: dept.department,
      service: null,
      positive: dept.counts.positive,
      negative: dept.counts.negative,
    });

    const serviceList = [...dept.services.entries()]
      .map(([name, counts]) => ({
        name,
        counts,
        total: counts.positive + counts.negative,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, MAX_SERVICES_PER_DEPT);

    for (const svc of serviceList) {
      if (svc.total === 0) continue;
      rows.push({
        rowKey: `svc:${dept.department}:${svc.name}`,
        label: `    ${svc.name}`,
        isDepartment: false,
        department: dept.department,
        service: svc.name,
        positive: svc.counts.positive,
        negative: svc.counts.negative,
      });
    }

    if (deptTotal === 0 && serviceList.length === 0) {
      rows.pop();
    }
  }

  return rows;
}
