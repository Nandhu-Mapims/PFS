import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Search } from "lucide-react";
import * as XLSX from "xlsx";
import type { FeedbackItem } from "../../lib/api";
import {
  encounterTypeLabel,
  matchesEncounterType,
  type EncounterTypeFilter,
} from "../../lib/insightsFilters";
import {
  buildPatientFeedbackGroups,
  type PatientFeedbackGroup,
} from "../../lib/patientFeedbackGroups";
import { getAiSentimentBucket } from "../../lib/sentiment";
import { FeedbackDetailDialog } from "../FeedbackDetailDialog";
import {
  KPI_LABELS,
  type InsightsKpiKind,
  rowsForKpi,
  visitTypeLabel,
} from "./insightsKpiDetail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

type Props = {
  kind: InsightsKpiKind | null;
  onClose: () => void;
  submissionRows: FeedbackItem[];
  periodLabel: string;
  /** Matches the dashboard Patient type filter — dialog inherits this instead of defaulting to "all". */
  dashboardEncounterFilter: EncounterTypeFilter;
};

function downloadExcel(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Data");
  XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

function matchesSearch(item: FeedbackItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    item.patientName,
    item.patientRegNo,
    item.lookupDepartment,
    item.department,
    item.service,
    item.comments,
    item.ticketId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function filterRows(
  rows: FeedbackItem[],
  encounter: EncounterTypeFilter,
  search: string
): FeedbackItem[] {
  return rows.filter(
    (item) =>
      matchesEncounterType(item.patientEncounterType, encounter) && matchesSearch(item, search)
  );
}

function filterGroups(
  groups: PatientFeedbackGroup[],
  encounter: EncounterTypeFilter,
  search: string
): PatientFeedbackGroup[] {
  return groups.filter((g) =>
    g.items.some(
      (item) =>
        matchesEncounterType(item.patientEncounterType, encounter) && matchesSearch(item, search)
    )
  );
}

const ENCOUNTER_OPTIONS: EncounterTypeFilter[] = ["all", "op", "ip", "name-only"];

function groupComments(group: PatientFeedbackGroup): string {
  const parts = [...new Set(group.items.map((i) => i.comments?.trim()).filter(Boolean))];
  return parts.join(" | ");
}

export function InsightsKpiDetailDialog({
  kind,
  onClose,
  submissionRows,
  periodLabel,
  dashboardEncounterFilter,
}: Props) {
  const [encounter, setEncounter] = useState<EncounterTypeFilter>(dashboardEncounterFilter);
  const [search, setSearch] = useState("");
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (item: FeedbackItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  const open = kind !== null;
  const label = kind ? KPI_LABELS[kind] : "";
  const showEncounterFilters = dashboardEncounterFilter === "all";

  useEffect(() => {
    if (kind !== null) {
      setEncounter(dashboardEncounterFilter);
      setSearch("");
    }
  }, [kind, dashboardEncounterFilter]);

  const baseRows = useMemo(
    () => (kind ? rowsForKpi(kind, submissionRows) : []),
    [kind, submissionRows]
  );

  const filteredRows = useMemo(() => {
    const encounterFilter = showEncounterFilters ? encounter : dashboardEncounterFilter;
    return filterRows(baseRows, encounterFilter, search);
  }, [baseRows, encounter, search, showEncounterFilters, dashboardEncounterFilter]);

  const filteredGroups = useMemo(() => {
    if (kind !== "patients") return [];
    const encounterFilter = showEncounterFilters ? encounter : dashboardEncounterFilter;
    return filterGroups(buildPatientFeedbackGroups(baseRows), encounterFilter, search);
  }, [kind, baseRows, encounter, search, showEncounterFilters, dashboardEncounterFilter]);

  const count = kind === "patients" ? filteredGroups.length : filteredRows.length;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      onClose();
    }
  };

  const handleDownload = () => {
    if (!kind) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const safePeriod = periodLabel.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 40);
    const safeKind = kind.replace(/[^\w-]/g, "");

    if (kind === "patients") {
      downloadExcel(
        `patients-${safeKind}-${safePeriod}-${stamp}.xlsx`,
        [
          "Patient name",
          "UHID",
          "Visit type",
          "Submissions",
          "Tickets",
          "Departments",
          "Services",
          "Lowest rating",
          "Status",
          "Sentiment",
          "Comments",
          "Last submitted",
        ],
        filteredGroups.map((g) => [
          g.patientName,
          g.patientRegNo || "",
          visitTypeLabel(g.representative.patientEncounterType),
          g.items.length,
          g.ticketCount,
          g.departments.join("; "),
          g.services.join("; "),
          g.lowestRating,
          g.statusLabel,
          g.dominantSentiment ?? "",
          groupComments(g),
          new Date(g.latestCreatedAt).toLocaleString(),
        ])
      );
      return;
    }

    downloadExcel(
      `${safeKind}-${safePeriod}-${stamp}.xlsx`,
      [
        "Patient name",
        "UHID",
        "Visit type",
        "Department",
        "Service",
        "Rating",
        "Sentiment",
        "Status",
        "Source",
        "Ticket ID",
        "Submitted",
        "Comments",
      ],
      filteredRows.map((item) => [
        item.patientName,
        item.patientRegNo?.trim() || "",
        visitTypeLabel(item.patientEncounterType),
        item.lookupDepartment || item.department || "",
        item.service || "",
        item.rating,
        getAiSentimentBucket(item) ?? "",
        item.status,
        item.source,
        item.ticketId || "",
        new Date(item.createdAt).toLocaleString(),
        item.comments || "",
      ])
    );
  };

  const description =
    kind === "patients"
      ? showEncounterFilters
        ? `Unique patients for ${periodLabel}. One visit = one patient. Narrow by OP, IP, or name-only below.`
        : `Unique patients for ${periodLabel}. One visit = one patient.`
      : showEncounterFilters
        ? `${label} for ${periodLabel}. Narrow by visit type below or search by name, UHID, department.`
        : `${label} for ${periodLabel}. Search by name, UHID, or department.`;

  return (
    <>
      <FeedbackDetailDialog
        item={detailItem}
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next);
          if (!next) setDetailItem(null);
        }}
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pr-8">
            <div>
              <DialogTitle>
                {label} ({count})
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
            {count > 0 ? (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Download size={16} />
                Download Excel
              </button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {showEncounterFilters ? (
            <div className="flex flex-wrap gap-1.5">
              {ENCOUNTER_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setEncounter(opt)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    encounter === opt
                      ? "bg-[#2A6FDB] text-white border-[#2A6FDB]"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {encounterTypeLabel(opt)}
                </button>
              ))}
            </div>
          ) : null}
          <div className={`relative flex-1 min-w-[180px]${showEncounterFilters ? "" : " sm:max-w-md"}`}>
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, UHID, department…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2A6FDB]/30"
            />
          </div>
        </div>

        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No rows match these filters.</p>
        ) : (
          <div className="min-w-0 w-full">
            {kind === "patients" ? (
              <PatientTable groups={filteredGroups} onView={openDetail} />
            ) : (
              <SubmissionTable rows={filteredRows} onView={openDetail} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

const TABLE_CELL = "px-3 py-2.5 align-top whitespace-nowrap";
const TABLE_HEAD =
  "px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap bg-white";
const ACTION_HEAD = `${TABLE_HEAD} sticky right-0 z-20 text-center shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]`;
const ACTION_CELL =
  "px-3 py-2.5 align-top text-center sticky right-0 z-10 bg-white shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)] group-hover:bg-gray-50/80";

function KpiTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-w-0 max-h-[50vh] overflow-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}

function PatientTable({
  groups,
  onView,
}: {
  groups: PatientFeedbackGroup[];
  onView: (item: FeedbackItem) => void;
}) {
  return (
    <KpiTableShell>
        <thead className="sticky top-0 z-30 border-b border-gray-200">
          <tr>
            <th className={TABLE_HEAD}>Patient</th>
            <th className={TABLE_HEAD}>UHID</th>
            <th className={TABLE_HEAD}>Visit</th>
            <th className={`${TABLE_HEAD} text-center`}>Rows</th>
            <th className={TABLE_HEAD}>Department</th>
            <th className={`${TABLE_HEAD} text-center`}>Rating</th>
            <th className={TABLE_HEAD}>Sentiment</th>
            <th className={`${TABLE_HEAD} max-w-[200px]`}>Comments</th>
            <th className={TABLE_HEAD}>Last submitted</th>
            <th className={ACTION_HEAD}>Action</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr
              key={g.groupKey}
              className="group border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer"
              onClick={() => onView(g.representative)}
            >
              <td className={`${TABLE_CELL} font-medium text-gray-800`}>{g.patientName}</td>
              <td className={`${TABLE_CELL} font-mono text-xs text-gray-600`}>
                {g.patientRegNo || "—"}
              </td>
              <td className={`${TABLE_CELL} text-xs font-medium text-gray-600`}>
                {visitTypeLabel(g.representative.patientEncounterType)}
              </td>
              <td className={`${TABLE_CELL} text-center tabular-nums text-gray-700`}>
                {g.items.length}
              </td>
              <td className={`${TABLE_CELL} text-gray-600`} title={g.departments.join(", ")}>
                {g.departments[0] || "—"}
                {g.departments.length > 1 ? ` +${g.departments.length - 1}` : ""}
              </td>
              <td className={`${TABLE_CELL} text-center tabular-nums text-gray-800`}>
                {g.lowestRating}
              </td>
              <td className={`${TABLE_CELL} capitalize text-gray-600`}>
                {g.dominantSentiment ?? "—"}
              </td>
              <td
                className="px-3 py-2.5 align-top text-xs text-gray-600 max-w-[200px] whitespace-normal line-clamp-2"
                title={groupComments(g) || undefined}
              >
                {groupComments(g) || "—"}
              </td>
              <td className={`${TABLE_CELL} text-xs text-gray-500`}>
                {new Date(g.latestCreatedAt).toLocaleString()}
              </td>
              <td className={ACTION_CELL}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(g.representative);
                  }}
                  className="text-xs font-semibold text-[#2A6FDB] hover:underline whitespace-nowrap"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
    </KpiTableShell>
  );
}

function SubmissionTable({
  rows,
  onView,
}: {
  rows: FeedbackItem[];
  onView: (item: FeedbackItem) => void;
}) {
  return (
    <KpiTableShell>
        <thead className="sticky top-0 z-30 border-b border-gray-200">
          <tr>
            <th className={TABLE_HEAD}>Patient</th>
            <th className={TABLE_HEAD}>UHID</th>
            <th className={TABLE_HEAD}>Visit</th>
            <th className={TABLE_HEAD}>Department</th>
            <th className={`${TABLE_HEAD} text-center`}>Rating</th>
            <th className={TABLE_HEAD}>Sentiment</th>
            <th className={TABLE_HEAD}>Status</th>
            <th className={`${TABLE_HEAD} max-w-[200px]`}>Comments</th>
            <th className={TABLE_HEAD}>Submitted</th>
            <th className={ACTION_HEAD}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr
              key={item._id}
              className="group border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer"
              onClick={() => onView(item)}
            >
              <td className={`${TABLE_CELL} font-medium text-gray-800`}>{item.patientName}</td>
              <td className={`${TABLE_CELL} font-mono text-xs text-gray-600`}>
                {item.patientRegNo?.trim() || "—"}
              </td>
              <td className={`${TABLE_CELL} text-xs font-medium text-gray-600`}>
                {visitTypeLabel(item.patientEncounterType)}
              </td>
              <td
                className={`${TABLE_CELL} text-gray-600`}
                title={item.lookupDepartment || item.department || undefined}
              >
                {item.lookupDepartment || item.department || "—"}
              </td>
              <td className={`${TABLE_CELL} text-center tabular-nums text-gray-800`}>{item.rating}</td>
              <td className={`${TABLE_CELL} capitalize text-gray-600`}>
                {getAiSentimentBucket(item) ?? "—"}
              </td>
              <td className={`${TABLE_CELL} text-xs text-gray-600`}>{item.status}</td>
              <td
                className="px-3 py-2.5 align-top text-xs text-gray-600 max-w-[200px] whitespace-normal line-clamp-2"
                title={item.comments?.trim() || undefined}
              >
                {item.comments?.trim() || "—"}
              </td>
              <td className={`${TABLE_CELL} text-xs text-gray-500`}>
                {new Date(item.createdAt).toLocaleString()}
              </td>
              <td className={ACTION_CELL}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(item);
                  }}
                  className="text-xs font-semibold text-[#2A6FDB] hover:underline whitespace-nowrap"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
    </KpiTableShell>
  );
}
