import type { FeedbackItem } from "./api";
import { displaySentimentForItem, groupSentimentLabel } from "./feedbackDisplay";
import { ticketDepartment, ticketService, ticketServices } from "./ticketFilters";

export type PatientFeedbackGroup = {
  groupKey: string;
  patientName: string;
  patientRegNo: string;
  representative: FeedbackItem;
  items: FeedbackItem[];
  ticketCount: number;
  services: string[];
  departments: string[];
  lowestRating: number;
  latestCreatedAt: string;
  /** Single status if all match, else "Mixed" */
  statusLabel: string;
  dominantSentiment: FeedbackItem["aiSentiment"] | "mixed" | null;
};

function groupKeyFor(item: FeedbackItem): string {
  if (item.submissionGroupId) {
    return `sg:${item.submissionGroupId}`;
  }
  const day = new Date(item.createdAt).toISOString().slice(0, 10);
  const name = item.patientName.trim().toLowerCase();
  const reg = (item.patientRegNo || "").trim().toLowerCase();
  return `p:${name}|${reg}|${day}`;
}

function pickRepresentative(items: FeedbackItem[]): FeedbackItem {
  const sorted = [...items].sort((a, b) => {
    if (a.isSplitChild !== b.isSplitChild) return a.isSplitChild ? 1 : -1;
    if (Boolean(a.ticketId) !== Boolean(b.ticketId)) return a.ticketId ? -1 : 1;
    return b._id.localeCompare(a._id);
  });
  return sorted[0];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort();
}

export function buildPatientFeedbackGroups(items: FeedbackItem[]): PatientFeedbackGroup[] {
  const map = new Map<string, FeedbackItem[]>();
  for (const item of items) {
    const key = groupKeyFor(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }

  const groups: PatientFeedbackGroup[] = [];
  for (const [groupKey, list] of map) {
    const sorted = [...list].sort((a, b) => b._id.localeCompare(a._id));
    const representative = pickRepresentative(sorted);
    const splitChildren = sorted.filter((i) => i.isSplitChild);
    const services =
      splitChildren.length > 0
        ? uniqueStrings(splitChildren.flatMap(ticketServices))
        : uniqueStrings(sorted.flatMap(ticketServices));
    const departments = uniqueStrings(sorted.map(ticketDepartment));
    const ratings = sorted.map((i) => i.rating);
    const statuses = uniqueStrings(sorted.map((i) => i.status));
    const groupSentiment = groupSentimentLabel(sorted);
    const dominantSentiment: FeedbackItem["aiSentiment"] | "mixed" | null =
      groupSentiment === "mixed" ? "mixed" : groupSentiment;

    groups.push({
      groupKey,
      patientName: representative.patientName,
      patientRegNo: representative.patientRegNo?.trim() || "",
      representative,
      items: sorted,
      ticketCount: sorted.filter((i) => Boolean(i.ticketId)).length,
      services,
      departments,
      lowestRating: ratings.length ? Math.min(...ratings) : representative.rating,
      latestCreatedAt: sorted[0]?.createdAt ?? representative.createdAt,
      statusLabel: statuses.length === 1 ? statuses[0] : "Mixed",
      dominantSentiment,
    });
  }

  return groups.sort((a, b) => b.representative._id.localeCompare(a.representative._id));
}

function singleItemOverviewGroup(
  parent: PatientFeedbackGroup,
  item: FeedbackItem
): PatientFeedbackGroup {
  const sentiment = displaySentimentForItem(item);
  return {
    groupKey: `${parent.groupKey}|${item._id}`,
    patientName: item.patientName,
    patientRegNo: item.patientRegNo?.trim() || parent.patientRegNo,
    representative: item,
    items: [item],
    ticketCount: item.ticketId ? 1 : 0,
    services: uniqueStrings(ticketServices(item)),
    departments: uniqueStrings([ticketDepartment(item)]),
    lowestRating: item.rating,
    latestCreatedAt: item.createdAt,
    statusLabel: item.status,
    dominantSentiment: sentiment,
  };
}

/** Overview: show each AI-split issue as its own row (like ticket management), not hidden under a mixed parent. */
export function expandOverviewGroupsForDisplay(
  groups: PatientFeedbackGroup[]
): PatientFeedbackGroup[] {
  const out: PatientFeedbackGroup[] = [];
  for (const group of groups) {
    const splitChildren = group.items.filter((i) => i.isSplitChild);
    if (splitChildren.length === 0) {
      out.push(group);
      continue;
    }
    for (const child of splitChildren) {
      out.push(singleItemOverviewGroup(group, child));
    }
  }
  return out.sort((a, b) => b.representative._id.localeCompare(a.representative._id));
}

/** Keep whole patient group when any row matches the predicate (e.g. filters). */
export function filterPatientGroups(
  groups: PatientFeedbackGroup[],
  matches: (item: FeedbackItem) => boolean
): PatientFeedbackGroup[] {
  return groups.filter((g) => g.items.some(matches));
}
