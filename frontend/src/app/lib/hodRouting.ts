import type { Department, FeedbackItem, ServiceCatalogItem, UserRow } from "./api";
import { ticketDepartment, ticketService, ticketServices } from "./ticketFilters";

/** Lowercase + strip punctuation so EMR labels can match catalog names. */
export function normKey(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** British → American spelling for canonical word comparison. */
const SPELLING_CANON: Array<[string, string]> = [
  ["paediatric", "pediatric"],
  ["orthopaedic", "orthopedic"],
  ["gynaecology", "gynecology"],
  ["haematology", "hematology"],
  ["anaesthesio", "anesthesio"],
];

function canonWord(word: string): string {
  let w = word;
  for (const [from, to] of SPELLING_CANON) {
    if (w.includes(from)) w = w.split(from).join(to);
  }
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

function canonWords(value: string | null | undefined): string[] {
  return normKey(value).split(" ").filter(Boolean).map(canonWord);
}

/**
 * Stable grouping key for a department/service label: case, punctuation,
 * British spelling and plurals all collapse, so PAEDIATRIC / PAEDIATRICS /
 * Paediatric share one key. Word count is preserved, so PAEDIATRIC DENTISTRY
 * keeps its own key and is never folded into PAEDIATRIC.
 */
export function canonLabelKey(value: string | null | undefined): string {
  return canonWords(value).join(" ");
}

/**
 * Fuzzy match for department/service labels.
 * Matches: PAEDIATRICS ↔ Paediatric, Orthopaedics ↔ Orthopedics,
 * Housekeeping ↔ House Keeping, Front Office ↔ Reception / Front Office.
 * Does NOT match single generic words into longer names (General vs General Medicine).
 */
export function labelsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = canonWords(a);
  const right = canonWords(b);
  if (!left.length || !right.length) return false;

  const leftJoin = left.join(" ");
  const rightJoin = right.join(" ");
  if (leftJoin === rightJoin) return true;
  // Compact compare covers spacing variants: House Keeping ↔ Housekeeping.
  if (left.join("") === right.join("")) return true;

  // Multi-word subset: every word of the shorter label appears in the longer.
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= 2) {
    const longerSet = new Set(longer);
    if (shorter.every((w) => longerSet.has(w))) return true;
  }

  return false;
}

export function userDepartmentName(user: UserRow): string {
  if (user.departmentId && typeof user.departmentId === "object" && "name" in user.departmentId) {
    return user.departmentId.name.trim();
  }
  return "";
}

export function userServiceName(user: UserRow): string {
  if (user.serviceId && typeof user.serviceId === "object" && "name" in user.serviceId) {
    return user.serviceId.name.trim();
  }
  return "";
}

/** All department names this HOD owns (multi-map + primary). */
export function userHodDepartmentNames(user: UserRow): string[] {
  const names = (user.hodDepartments || []).map((d) => d.name.trim()).filter(Boolean);
  const primary = userDepartmentName(user);
  if (primary && !names.some((n) => labelsMatch(n, primary))) names.push(primary);
  return names;
}

/** All service names this HOD owns (multi-map + primary). */
export function userHodServiceNames(user: UserRow): string[] {
  const names = (user.hodServices || []).map((s) => s.name.trim()).filter(Boolean);
  const primary = userServiceName(user);
  if (primary && !names.some((n) => labelsMatch(n, primary))) names.push(primary);
  return names;
}

export function hodLabelForSelect(user: UserRow): string {
  const depts = userHodDepartmentNames(user);
  const svcs = userHodServiceNames(user);
  const parts = [...depts, ...svcs];
  if (!parts.length) return user.username;
  const shown = parts.slice(0, 2).join(", ");
  const more = parts.length > 2 ? ` +${parts.length - 2}` : "";
  return `${user.username} · ${shown}${more}`;
}

export function hodIdForDepartmentName(
  departments: Department[],
  departmentName: string
): string | null {
  if (!normKey(departmentName)) return null;
  const dept = departments.find((d) => labelsMatch(d.name, departmentName));
  return dept?.hodUserId?._id ?? null;
}

export function hodIdForServiceName(
  services: ServiceCatalogItem[],
  serviceName: string
): string | null {
  if (!normKey(serviceName)) return null;
  const svc = services.find((s) => labelsMatch(s.name, serviceName));
  return svc?.hodUserId?._id ?? null;
}

/**
 * Departments this ticket itself belongs to.
 * Split children carry the parent's FULL feedbackIssues array, so we must NOT
 * scan all issues — only the ticket's own visit/issue department. Otherwise a
 * Paediatrics ticket whose sibling issue is General Medicine leaks into the
 * General Medicine HOD queue.
 */
function ticketDepartmentKeys(item: FeedbackItem): string[] {
  const keys = new Set<string>();
  const primary = ticketDepartment(item);
  if (primary) keys.add(primary);
  const own = String(item.department || "").trim();
  if (own) keys.add(own);
  if (!item.isSplitChild) {
    // Parent row represents the first issue only; siblings have their own tickets.
    const firstIssue = (item.feedbackIssues || [])[0];
    const d = String(firstIssue?.department || "").trim();
    if (d) keys.add(d);
  }
  return [...keys];
}

/** Services this ticket itself is routed to (same own-issue rule as departments). */
function ticketServiceKeys(item: FeedbackItem): string[] {
  const keys = new Set<string>();
  const primary = ticketService(item);
  if (primary) keys.add(primary);
  if (item.isSplitChild) return [...keys];
  const services = ticketServices(item);
  if (services.length === 1) {
    keys.add(services[0]);
  } else {
    const firstIssue = (item.feedbackIssues || [])[0];
    const s = String(firstIssue?.recommendedService || "").trim();
    if (s) keys.add(s);
  }
  return [...keys];
}

function hodIdFromUserMappings(
  hodUsers: UserRow[],
  departmentNames: string[],
  serviceNames: string[]
): string | null {
  for (const dept of departmentNames) {
    const match = hodUsers.find((u) =>
      userHodDepartmentNames(u).some((name) => labelsMatch(name, dept))
    );
    if (match) return match._id;
  }
  for (const svc of serviceNames) {
    const match = hodUsers.find((u) =>
      userHodServiceNames(u).some((name) => labelsMatch(name, svc))
    );
    if (match) return match._id;
  }
  return null;
}

/**
 * Recommend HOD by:
 * 1) department.hodUserId (catalog map)
 * 2) service.hodUserId (catalog map)
 * 3) HOD user multi-mappings (hodDepartments / hodServices)
 */
export function defaultHodForTicket(
  ticket: FeedbackItem | null,
  departments: Department[],
  services: ServiceCatalogItem[],
  hodUsers: UserRow[]
): string | null {
  if (!ticket) return null;

  const deptNames = ticketDepartmentKeys(ticket);
  for (const deptName of deptNames) {
    const fromDeptMap = hodIdForDepartmentName(departments, deptName);
    if (fromDeptMap) return fromDeptMap;
  }

  const svcNames = ticketServiceKeys(ticket);
  for (const svcName of svcNames) {
    const fromSvc = hodIdForServiceName(services, svcName);
    if (fromSvc) return fromSvc;
  }

  return hodIdFromUserMappings(hodUsers, deptNames, svcNames);
}

export function sortHodAssignees(
  hods: UserRow[],
  ticket: FeedbackItem | null,
  defaultHodId: string | null,
  departments: Department[],
  services: ServiceCatalogItem[]
): UserRow[] {
  const ticketDeptNames = ticket ? ticketDepartmentKeys(ticket) : [];
  const ticketSvcNames = ticket ? ticketServiceKeys(ticket) : [];
  const deptHodIds = new Set(
    ticketDeptNames
      .map((name) => hodIdForDepartmentName(departments, name))
      .filter((id): id is string => Boolean(id))
  );
  const serviceHodIds = new Set(
    ticketSvcNames
      .map((name) => hodIdForServiceName(services, name))
      .filter((id): id is string => Boolean(id))
  );

  return [...hods].sort((a, b) => {
    const rank = (u: UserRow) => {
      if (defaultHodId && u._id === defaultHodId) return 0;
      if (deptHodIds.has(u._id)) return 1;
      if (serviceHodIds.has(u._id)) return 2;
      if (
        ticketDeptNames.some((dept) =>
          userHodDepartmentNames(u).some((name) => labelsMatch(name, dept))
        )
      ) {
        return 3;
      }
      if (
        ticketSvcNames.some((svc) =>
          userHodServiceNames(u).some((name) => labelsMatch(name, svc))
        )
      ) {
        return 3;
      }
      return 4;
    };
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.username.localeCompare(b.username);
  });
}

/**
 * HODs see ONLY tickets manually assigned to them by admin/staff.
 * Department/service mappings are used purely to recommend an assignee.
 */
export function visibleToHod(item: FeedbackItem, hodUserId: string): boolean {
  return Boolean(hodUserId && item.assignedToUserId === hodUserId);
}
