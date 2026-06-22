import type { Department, FeedbackItem, ServiceCatalogItem, UserRow } from "./api";
import { ticketDepartment, ticketService, ticketServices } from "./ticketFilters";

function normKey(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
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

export function hodIdForDepartmentName(
  departments: Department[],
  departmentName: string
): string | null {
  const key = normKey(departmentName);
  if (!key) return null;
  const dept = departments.find((d) => normKey(d.name) === key);
  return dept?.hodUserId?._id ?? null;
}

export function hodIdForServiceName(
  services: ServiceCatalogItem[],
  serviceName: string
): string | null {
  const key = normKey(serviceName);
  if (!key) return null;
  const svc = services.find((s) => normKey(s.name) === key);
  return svc?.hodUserId?._id ?? null;
}

export function serviceNamesForHod(
  services: ServiceCatalogItem[],
  hodUserId: string
): string[] {
  return services
    .filter((s) => s.hodUserId?._id === hodUserId)
    .map((s) => normKey(s.name))
    .filter(Boolean);
}

function ticketServiceKeys(item: FeedbackItem): string[] {
  const keys = new Set<string>();
  const primary = normKey(ticketService(item));
  if (primary) keys.add(primary);
  for (const svc of ticketServices(item)) {
    const k = normKey(svc);
    if (k) keys.add(k);
  }
  for (const issue of item.feedbackIssues || []) {
    const k = normKey(issue.recommendedService);
    if (k) keys.add(k);
  }
  return [...keys];
}

export function defaultHodForTicket(
  ticket: FeedbackItem | null,
  departments: Department[],
  services: ServiceCatalogItem[],
  hodUsers: UserRow[]
): string | null {
  if (!ticket) return null;

  const deptName = ticketDepartment(ticket);
  const fromDeptMap = hodIdForDepartmentName(departments, deptName);
  if (fromDeptMap) return fromDeptMap;

  for (const svcKey of ticketServiceKeys(ticket)) {
    const fromSvc = hodIdForServiceName(services, svcKey);
    if (fromSvc) return fromSvc;
  }

  for (const svcKey of ticketServiceKeys(ticket)) {
    const fromUserSvc = hodUsers.find((u) => normKey(userServiceName(u)) === svcKey);
    if (fromUserSvc) return fromUserSvc._id;
  }

  const deptKey = normKey(deptName);
  if (deptKey) {
    const fromUserDept = hodUsers.find((u) => normKey(userDepartmentName(u)) === deptKey);
    if (fromUserDept) return fromUserDept._id;
  }

  return null;
}

export function sortHodAssignees(
  hods: UserRow[],
  ticket: FeedbackItem | null,
  defaultHodId: string | null,
  departments: Department[],
  services: ServiceCatalogItem[]
): UserRow[] {
  const ticketDept = ticket ? normKey(ticketDepartment(ticket)) : "";
  const ticketSvcKeys = ticket ? new Set(ticketServiceKeys(ticket)) : new Set<string>();
  const deptHodId = ticket ? hodIdForDepartmentName(departments, ticketDepartment(ticket)) : null;
  const serviceHodIds = new Set(
    [...ticketSvcKeys]
      .map((k) => hodIdForServiceName(services, k))
      .filter((id): id is string => Boolean(id))
  );

  return [...hods].sort((a, b) => {
    const rank = (u: UserRow) => {
      if (defaultHodId && u._id === defaultHodId) return 0;
      if (deptHodId && u._id === deptHodId) return 1;
      if (serviceHodIds.has(u._id)) return 2;
      if (ticketDept && normKey(userDepartmentName(u)) === ticketDept) return 3;
      if ([...ticketSvcKeys].some((k) => normKey(userServiceName(u)) === k)) return 3;
      return 4;
    };
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.username.localeCompare(b.username);
  });
}

export function matchesHodDepartment(item: FeedbackItem, departmentName: string): boolean {
  const target = normKey(departmentName);
  if (!target) return true;
  if (normKey(ticketDepartment(item)) === target) return true;
  return (item.feedbackIssues || []).some((issue) => normKey(issue.department) === target);
}

export function matchesHodServices(item: FeedbackItem, serviceNames: string[]): boolean {
  if (!serviceNames.length) return false;
  const allowed = new Set(serviceNames);
  return ticketServiceKeys(item).some((k) => allowed.has(k));
}

export function visibleToHod(
  item: FeedbackItem,
  hodUserId: string,
  hodDepartment: string,
  hodServiceNames: string[]
): boolean {
  if (hodUserId && item.assignedToUserId === hodUserId) return true;
  if (hodDepartment && matchesHodDepartment(item, hodDepartment)) return true;
  if (matchesHodServices(item, hodServiceNames)) return true;
  return false;
}
