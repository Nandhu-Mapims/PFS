import {
  Building2,
  CircleAlert,
  LayoutGrid,
  Layers,
  LoaderCircle,
  Search,
  Users,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  getFeedback,
  getFeedbackAnalytics,
  getServices,
  updateFeedbackStatus,
  type FeedbackAnalytics,
  type FeedbackItem,
  type ServiceCatalogItem,
} from "../lib/api";
import { getSession } from "../lib/auth";
import { serviceNamesForHod, visibleToHod } from "../lib/hodRouting";
import { displayOptionalLabel, sanitizeOptionalLabel } from "../lib/fieldSanitize";
import { matchesEncounterType, type EncounterTypeFilter } from "../lib/insightsFilters";
import { EncounterTypeFilterTabs } from "./EncounterTypeFilterTabs";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

const statusOptions: FeedbackItem["status"][] = ["New", "In Progress", "Resolved"];

type ViewMode = "department" | "service" | "combined";

const COMBINED_KEY_SEP = "|||";

function departmentKey(item: FeedbackItem): string {
  return sanitizeOptionalLabel(item.lookupDepartment || item.department) || "";
}

function serviceKey(item: FeedbackItem): string {
  const fromIssue = item.feedbackIssues?.find((i) =>
    sanitizeOptionalLabel(i.recommendedService)
  )?.recommendedService;
  return sanitizeOptionalLabel(item.service || fromIssue) || "";
}

function combinedPair(item: FeedbackItem): { dept: string; svc: string } {
  return {
    dept: departmentKey(item) || "(No department)",
    svc: serviceKey(item) || "(No service)",
  };
}

function combinedFilterKey(dept: string, svc: string) {
  return `${dept}${COMBINED_KEY_SEP}${svc}`;
}

function FeedbackTable({
  rows,
  onStatusChange,
  hodUserId,
  onOpenTicket,
}: {
  rows: FeedbackItem[];
  onStatusChange: (id: string, status: FeedbackItem["status"]) => void;
  hodUserId?: string;
  onOpenTicket?: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground p-8 text-center text-sm">
        No feedback in this group.
      </div>
    );
  }

  return (
    <div className="max-h-[50vh] overflow-auto">
      <Table>
        <TableHeader className="bg-muted/30 sticky top-0 z-10">
          <TableRow>
            <TableHead className="px-4">Patient</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="min-w-[200px]">Comments</TableHead>
            <TableHead className="min-w-[160px]">Remark</TableHead>
            <TableHead className="pr-4">Submitted</TableHead>
            {onOpenTicket ? <TableHead className="pr-4 text-right"> </TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => (
            <TableRow key={item._id}>
              <TableCell className="px-4 font-medium">{item.patientName}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {displayOptionalLabel(item.lookupDepartment || item.department)}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {displayOptionalLabel(serviceKey(item))}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {item.rating} — {ratingLabel[item.rating]}
              </TableCell>
              <TableCell className="space-y-2">
                <Badge
                  variant="outline"
                  className={
                    item.status === "New"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : item.status === "In Progress"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }
                >
                  {item.status}
                </Badge>
                <Select
                  value={item.status}
                  onValueChange={(value) =>
                    onStatusChange(item._id, value as FeedbackItem["status"])
                  }
                >
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue placeholder="Update status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm whitespace-normal">
                {item.comments || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm whitespace-normal max-w-[200px]">
                {item.staffRemarks?.trim() || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground pr-4 text-sm">
                {new Date(item.createdAt).toLocaleString()}
                {hodUserId && item.assignedToUserId === hodUserId ? (
                  <span className="block text-xs font-semibold text-emerald-700 mt-1">Assigned to you</span>
                ) : null}
              </TableCell>
              {onOpenTicket ? (
                <TableCell className="pr-4 text-right">
                  {item.ticketId ? (
                    <button
                      type="button"
                      onClick={() => onOpenTicket(item._id)}
                      className="text-sm font-semibold text-[#2A6FDB] hover:underline"
                    >
                      View ticket
                    </button>
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryStrip({
  title,
  rows,
  activeKey,
  onSelect,
}: {
  title: string;
  rows: Array<{ key: string; label: string; count: number; newCount: number }>;
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4">No labeled {title.toLowerCase()} yet.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect("All")}
        className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
          activeKey === "All"
            ? "border-[#2A6FDB] bg-blue-50 text-[#2A6FDB]"
            : "border-gray-200 bg-white hover:bg-gray-50"
        }`}
      >
        <span className="font-semibold">All</span>
      </button>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={() => onSelect(row.key)}
          className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors min-w-[120px] ${
            activeKey === row.key
              ? "border-[#2A6FDB] bg-blue-50 text-[#2A6FDB]"
              : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <span className="font-semibold block truncate max-w-[180px]" title={row.label}>
            {row.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.count} total · {row.newCount} new
          </span>
        </button>
      ))}
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const session = getSession();
  const isHod = session?.role === "hod";
  const hodDepartment = session?.departmentName?.trim() || "";
  const hodUserId = session?._id || "";
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [analytics, setAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [filterService, setFilterService] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCombined, setFilterCombined] = useState("All");
  const [encounterFilter, setEncounterFilter] = useState<EncounterTypeFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("department");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        const [data, analyticsData, servicesData] = await Promise.all([
          getFeedback(),
          getFeedbackAnalytics(),
          isHod ? getServices() : Promise.resolve([] as ServiceCatalogItem[]),
        ]);
        setItems(data);
        setAnalytics(analyticsData);
        setServiceCatalog(servicesData);
      } catch {
        setError("Failed to load staff queue.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, [isHod]);

  const hodServiceNames = useMemo(() => {
    if (!isHod) return [];
    const names = serviceNamesForHod(serviceCatalog, hodUserId);
    const fromSession = session?.serviceName?.trim().toLowerCase();
    if (fromSession && !names.includes(fromSession)) names.push(fromSession);
    return names;
  }, [isHod, serviceCatalog, hodUserId, session?.serviceName]);

  const visibleItems = useMemo(() => {
    if (!isHod) return items;
    return items.filter((item) =>
      visibleToHod(item, hodUserId, hodDepartment, hodServiceNames)
    );
  }, [items, isHod, hodUserId, hodDepartment, hodServiceNames]);

  const departments = useMemo(() => {
    const keys = new Set<string>();
    for (const row of analytics?.submissionsByDepartment ?? []) {
      if (row.department) keys.add(row.department);
    }
    for (const item of visibleItems) {
      const k = departmentKey(item);
      if (k) keys.add(k);
    }
    return ["All", ...[...keys].sort((a, b) => a.localeCompare(b))];
  }, [visibleItems, analytics]);

  const services = useMemo(() => {
    const keys = new Set<string>();
    for (const row of [
      ...(analytics?.positiveByService ?? []),
      ...(analytics?.negativeByService ?? []),
    ]) {
      if (row.service) keys.add(row.service);
    }
    for (const item of visibleItems) {
      const k = serviceKey(item);
      if (k) keys.add(k);
    }
    return ["All", ...[...keys].sort((a, b) => a.localeCompare(b))];
  }, [visibleItems, analytics]);

  const filteredItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return visibleItems.filter((item) => {
      const matchesSearch =
        !search ||
        item.patientName.toLowerCase().includes(search) ||
        (item.comments || "").toLowerCase().includes(search) ||
        (item.staffRemarks || "").toLowerCase().includes(search);
      const dept = departmentKey(item);
      const svc = serviceKey(item);
      const matchesDepartment =
        filterDepartment === "All" || dept === filterDepartment;
      const matchesService = filterService === "All" || svc === filterService;
      const matchesStatus = filterStatus === "All" || item.status === filterStatus;
      const matchesEncounter = matchesEncounterType(item.patientEncounterType, encounterFilter);
      return (
        matchesSearch &&
        matchesDepartment &&
        matchesService &&
        matchesStatus &&
        matchesEncounter
      );
    });
  }, [visibleItems, searchTerm, filterDepartment, filterService, filterStatus, encounterFilter]);

  const departmentSummary = useMemo(() => {
    const map = new Map<string, { count: number; newCount: number }>();
    for (const item of visibleItems) {
      const key = departmentKey(item) || "(No department)";
      const prev = map.get(key) || { count: 0, newCount: 0 };
      prev.count += 1;
      if (item.status === "New") prev.newCount += 1;
      map.set(key, prev);
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, label: key, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [visibleItems]);

  const serviceSummary = useMemo(() => {
    const map = new Map<string, { count: number; newCount: number }>();
    for (const item of visibleItems) {
      const key = serviceKey(item) || "(No service)";
      const prev = map.get(key) || { count: 0, newCount: 0 };
      prev.count += 1;
      if (item.status === "New") prev.newCount += 1;
      map.set(key, prev);
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, label: key, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [visibleItems]);

  const groupedByDepartment = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>();
    for (const item of filteredItems) {
      const key = departmentKey(item) || "(No department)";
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filteredItems]);

  const groupedByService = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>();
    for (const item of filteredItems) {
      const key = serviceKey(item) || "(No service)";
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filteredItems]);

  const combinedSummary = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; count: number; newCount: number }
    >();
    for (const item of visibleItems) {
      const { dept, svc } = combinedPair(item);
      const key = combinedFilterKey(dept, svc);
      const prev = map.get(key) || {
        key,
        label: `${dept} · ${svc}`,
        count: 0,
        newCount: 0,
      };
      prev.count += 1;
      if (item.status === "New") prev.newCount += 1;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [visibleItems]);

  const groupedCombined = useMemo(() => {
    const outer = new Map<string, Map<string, FeedbackItem[]>>();
    for (const item of filteredItems) {
      const { dept, svc } = combinedPair(item);
      if (!outer.has(dept)) outer.set(dept, new Map());
      const inner = outer.get(dept)!;
      const list = inner.get(svc) || [];
      list.push(item);
      inner.set(svc, list);
    }
    return [...outer.entries()]
      .map(([dept, svcMap]) => ({
        dept,
        services: [...svcMap.entries()].sort((a, b) => b[1].length - a[1].length),
        total: [...svcMap.values()].reduce((sum, rows) => sum + rows.length, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  const totalCount = visibleItems.length;
  const newCount = visibleItems.filter((item) => item.status === "New").length;
  const inProgressCount = visibleItems.filter((item) => item.status === "In Progress").length;
  const resolvedCount = visibleItems.filter((item) => item.status === "Resolved").length;

  async function handleStatusChange(id: string, status: FeedbackItem["status"]) {
    try {
      setError(null);
      const updated = await updateFeedbackStatus(id, status);
      setItems((current) => current.map((item) => (item._id === id ? updated : item)));
    } catch {
      setError("Failed to update status.");
    }
  }

  const activeFilterKey =
    viewMode === "department"
      ? filterDepartment
      : viewMode === "service"
        ? filterService
        : filterCombined;

  function selectDepartmentFilter(key: string) {
    setFilterDepartment(key);
    setFilterCombined("All");
  }

  function selectServiceFilter(key: string) {
    setFilterService(key);
    setFilterCombined("All");
  }

  function selectCombinedFilter(key: string) {
    setFilterCombined(key);
    if (key === "All") {
      setFilterDepartment("All");
      setFilterService("All");
      return;
    }
    const sep = key.indexOf(COMBINED_KEY_SEP);
    if (sep === -1) return;
    setFilterDepartment(key.slice(0, sep));
    setFilterService(key.slice(sep + COMBINED_KEY_SEP.length));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {isHod ? "HOD feedback queue" : "Staff feedback queue"}
        </h2>
        <p className="text-muted-foreground text-sm md:text-base">
          {isHod
            ? hodDepartment || hodServiceNames.length
              ? `Tickets assigned to you, your department${hodDepartment ? ` (${hodDepartment})` : ""}, and mapped services`
              : "Tickets assigned to you"
            : "View and resolve feedback by hospital department and routing service"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Total</CardDescription>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground flex items-center gap-2 text-xs">
            <Users size={14} />
            All submissions
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">New</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{newCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground text-xs">Needs triage</CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">In progress</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{inProgressCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground flex items-center gap-2 text-xs">
            <LoaderCircle size={14} />
            Under review
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Resolved</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{resolvedCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground flex items-center gap-2 text-xs">
            <CheckCircle2 size={14} />
            Closed
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="pt-6 space-y-4">
          <EncounterTypeFilterTabs
            value={encounterFilter}
            onChange={setEncounterFilter}
            showHint
          />
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <Search
                className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                size={18}
              />
              <Input
                type="text"
                placeholder="Search patient or comments…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === "All" ? "All departments" : d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterService} onValueChange={setFilterService}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "All" ? "All services" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All status</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground p-6">Loading staff queue…</p>
      ) : error ? (
        <p className="p-6 text-red-600 flex items-center gap-2">
          <CircleAlert size={16} />
          {error}
        </p>
      ) : (
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 rounded-xl h-11">
            <TabsTrigger value="department" className="rounded-lg text-sm font-semibold gap-1.5 px-2">
              <Building2 size={16} />
              Department
            </TabsTrigger>
            <TabsTrigger value="service" className="rounded-lg text-sm font-semibold gap-1.5 px-2">
              <Layers size={16} />
              Service
            </TabsTrigger>
            <TabsTrigger value="combined" className="rounded-lg text-sm font-semibold gap-1.5 px-2">
              <LayoutGrid size={16} />
              Combined
            </TabsTrigger>
          </TabsList>

          <TabsContent value="department" className="space-y-4 mt-0">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Departments</CardTitle>
                <CardDescription>
                  Visit department from UHID / EMR ({filteredItems.length} shown)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SummaryStrip
                  title="departments"
                  rows={departmentSummary}
                  activeKey={activeFilterKey}
                  onSelect={selectDepartmentFilter}
                />
              </CardContent>
            </Card>
            {groupedByDepartment.map(([groupName, groupRows]) => (
              <Card key={groupName} className="rounded-2xl shadow-sm overflow-hidden">
                <CardHeader className="border-b bg-muted/20 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 size={18} className="text-[#2A6FDB]" />
                      {groupName}
                    </CardTitle>
                    <Badge variant="outline">{groupRows.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <FeedbackTable
                    rows={groupRows}
                    onStatusChange={handleStatusChange}
                    hodUserId={isHod ? hodUserId : undefined}
                    onOpenTicket={isHod ? (id) => navigate(`/ticket/${id}`) : undefined}
                  />
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="service" className="space-y-4 mt-0">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Services</CardTitle>
                <CardDescription>
                  AI recommended routing service ({filteredItems.length} shown)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SummaryStrip
                  title="services"
                  rows={serviceSummary}
                  activeKey={activeFilterKey}
                  onSelect={selectServiceFilter}
                />
              </CardContent>
            </Card>
            {groupedByService.map(([groupName, groupRows]) => (
              <Card key={groupName} className="rounded-2xl shadow-sm overflow-hidden">
                <CardHeader className="border-b bg-muted/20 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Layers size={18} className="text-violet-700" />
                      {groupName}
                    </CardTitle>
                    <Badge variant="outline">{groupRows.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <FeedbackTable
                    rows={groupRows}
                    onStatusChange={handleStatusChange}
                    hodUserId={isHod ? hodUserId : undefined}
                    onOpenTicket={isHod ? (id) => navigate(`/ticket/${id}`) : undefined}
                  />
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="combined" className="space-y-4 mt-0">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Department + service</CardTitle>
                <CardDescription>
                  Each pair shows visit department and AI routing service ({filteredItems.length}{" "}
                  shown)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SummaryStrip
                  title="pairs"
                  rows={combinedSummary}
                  activeKey={activeFilterKey}
                  onSelect={selectCombinedFilter}
                />
              </CardContent>
            </Card>
            {groupedCombined.map(({ dept, services, total }) => (
              <Card key={dept} className="rounded-2xl shadow-sm overflow-hidden">
                <CardHeader className="border-b bg-[#2A6FDB]/5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 size={18} className="text-[#2A6FDB]" />
                      {dept}
                    </CardTitle>
                    <Badge variant="outline">{total} in dept</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 space-y-0">
                  {services.map(([svc, groupRows]) => (
                    <div key={`${dept}-${svc}`} className="border-t border-gray-100 first:border-t-0">
                      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-violet-50/50">
                        <p className="text-sm font-semibold text-violet-900 flex items-center gap-2">
                          <Layers size={16} />
                          {svc}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {groupRows.length}
                        </Badge>
                      </div>
                      <FeedbackTable
                    rows={groupRows}
                    onStatusChange={handleStatusChange}
                    hodUserId={isHod ? hodUserId : undefined}
                    onOpenTicket={isHod ? (id) => navigate(`/ticket/${id}`) : undefined}
                  />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}

      {!isLoading && !error && filteredItems.length === 0 && (
        <p className="text-muted-foreground text-center text-sm py-8">
          No feedback matches the current filters.
        </p>
      )}
    </div>
  );
}
