import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import * as XLSX from "xlsx";
import type { FeedbackItem } from "../../lib/api";
import {
  encounterTypeLabel,
  matchesEncounterType,
  type EncounterTypeFilter,
  type PeriodGranularity,
} from "../../lib/insightsFilters";
import { getAiSentimentBucket } from "../../lib/sentiment";
import { FeedbackDetailDialog } from "../FeedbackDetailDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { visitTypeLabel } from "./insightsKpiDetail";
import {
  rowsForTicketSelection,
  titleForTicketSelection,
  type TicketSelection,
} from "./ticketsKpiDetail";

type Props = {
  selection: TicketSelection | null;
  onClose: () => void;
  ticketRows: FeedbackItem[];
  periodLabel: string;
  periodFilter: PeriodGranularity;
  dashboardEncounterFilter: EncounterTypeFilter;
};

const ENCOUNTER_OPTIONS: EncounterTypeFilter[] = ["all", "op-ip", "op", "ip", "name-only"];

function downloadExcel(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Tickets");
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

const TABLE_CELL = "px-3 py-2.5 align-top whitespace-nowrap";
const TABLE_HEAD =
  "px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap bg-white";
const ACTION_HEAD = `${TABLE_HEAD} sticky right-0 z-20 text-center shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]`;
const ACTION_CELL =
  "px-3 py-2.5 align-top text-center sticky right-0 z-10 bg-white shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)] group-hover:bg-gray-50/80";

export function TicketsKpiDetailDialog({
  selection,
  onClose,
  ticketRows,
  periodLabel,
  periodFilter,
  dashboardEncounterFilter,
}: Props) {
  const [encounter, setEncounter] = useState<EncounterTypeFilter>(dashboardEncounterFilter);
  const [search, setSearch] = useState("");
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const open = selection !== null;
  const label = selection ? titleForTicketSelection(selection, periodFilter) : "";
  const showEncounterFilters = dashboardEncounterFilter === "all";

  useEffect(() => {
    if (selection !== null) {
      setEncounter(dashboardEncounterFilter);
      setSearch("");
    }
  }, [selection, dashboardEncounterFilter]);

  const baseRows = useMemo(
    () => (selection ? rowsForTicketSelection(ticketRows, selection, periodFilter) : []),
    [selection, ticketRows, periodFilter]
  );

  const filteredRows = useMemo(() => {
    const encounterFilter = showEncounterFilters ? encounter : dashboardEncounterFilter;
    return baseRows.filter(
      (item) =>
        matchesEncounterType(item.patientEncounterType, encounterFilter) &&
        matchesSearch(item, search)
    );
  }, [baseRows, encounter, search, showEncounterFilters, dashboardEncounterFilter]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      onClose();
    }
  };

  const handleDownload = () => {
    if (!selection) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const safePeriod = periodLabel.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 40);
    const safeTitle = label.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 40);
    downloadExcel(
      `tickets-${safeTitle}-${safePeriod}-${stamp}.xlsx`,
      [
        "Patient name",
        "UHID",
        "Ticket ID",
        "Visit type",
        "Department",
        "Service",
        "Rating",
        "Sentiment",
        "Status",
        "Split issue",
        "Submitted",
        "Comments",
      ],
      filteredRows.map((item) => [
        item.patientName,
        item.patientRegNo?.trim() || "",
        item.ticketId || "",
        visitTypeLabel(item.patientEncounterType),
        item.department || item.lookupDepartment || "",
        item.service || "",
        item.rating,
        getAiSentimentBucket(item) ?? "",
        item.status,
        item.isSplitChild ? "Yes" : "No",
        new Date(item.createdAt).toLocaleString(),
        item.comments || "",
      ])
    );
  };

  const description = showEncounterFilters
    ? `${label} for ${periodLabel}. Narrow by visit type or search below.`
    : `${label} for ${periodLabel}. Search by name, UHID, ticket ID, or department.`;

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
                  {label} ({filteredRows.length})
                </DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
              {filteredRows.length > 0 ? (
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
            <div
              className={`relative flex-1 min-w-[180px]${showEncounterFilters ? "" : " sm:max-w-md"}`}
            >
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, UHID, ticket ID…"
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2A6FDB]/30"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No tickets match these filters.</p>
          ) : (
            <div className="w-full min-w-0 max-h-[50vh] overflow-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-30 border-b border-gray-200">
                  <tr>
                    <th className={TABLE_HEAD}>Patient</th>
                    <th className={TABLE_HEAD}>UHID</th>
                    <th className={TABLE_HEAD}>Ticket</th>
                    <th className={TABLE_HEAD}>Visit</th>
                    <th className={TABLE_HEAD}>Department</th>
                    <th className={TABLE_HEAD}>Service</th>
                    <th className={`${TABLE_HEAD} text-center`}>Rating</th>
                    <th className={TABLE_HEAD}>Status</th>
                    <th className={`${TABLE_HEAD} max-w-[180px]`}>Comments</th>
                    <th className={TABLE_HEAD}>Submitted</th>
                    <th className={ACTION_HEAD}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => (
                    <tr
                      key={item._id}
                      className="group border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer"
                      onClick={() => {
                        setDetailItem(item);
                        setDetailOpen(true);
                      }}
                    >
                      <td className={`${TABLE_CELL} font-medium text-gray-800`}>{item.patientName}</td>
                      <td className={`${TABLE_CELL} font-mono text-xs text-gray-600`}>
                        {item.patientRegNo?.trim() || "—"}
                      </td>
                      <td className={`${TABLE_CELL} font-mono text-xs text-gray-700`}>
                        {item.ticketId || "—"}
                      </td>
                      <td className={`${TABLE_CELL} text-xs text-gray-600`}>
                        {visitTypeLabel(item.patientEncounterType)}
                      </td>
                      <td className={`${TABLE_CELL} text-gray-600`}>
                        {item.department || item.lookupDepartment || "—"}
                      </td>
                      <td className={`${TABLE_CELL} text-gray-600`}>{item.service || "—"}</td>
                      <td className={`${TABLE_CELL} text-center tabular-nums`}>{item.rating}</td>
                      <td className={`${TABLE_CELL} text-xs`}>{item.status}</td>
                      <td
                        className="px-3 py-2.5 align-top text-xs text-gray-600 max-w-[180px] whitespace-normal line-clamp-2"
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
                            setDetailItem(item);
                            setDetailOpen(true);
                          }}
                          className="text-xs font-semibold text-[#2A6FDB] hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
