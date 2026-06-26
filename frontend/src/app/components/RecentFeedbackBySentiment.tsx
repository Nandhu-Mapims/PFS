import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { FeedbackItem } from "../lib/api";
import { getTotalPages, paginateSlice } from "../lib/pagination";
import { getAiSentimentBucket } from "../lib/sentiment";
import { ticketDepartment, ticketService, uniqueSorted } from "../lib/ticketFilters";
import {
  last12WeeksRange,
  last30DaysRange,
  matchesEncounterType,
  type EncounterTypeFilter,
  type FeedbackListScope,
} from "../lib/insightsFilters";
import { EncounterTypeFilterTabs } from "./EncounterTypeFilterTabs";
import { FeedbackDetailDialog } from "./FeedbackDetailDialog";
import { ListPagination } from "./ListPagination";
import { PatientGroupedFeedbackTable } from "./PatientGroupedFeedbackTable";
import { buildPatientFeedbackGroups } from "../lib/patientFeedbackGroups";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

type AiSentimentFilter = "all" | "positive" | "negative" | "neutral" | "pending";
type StatusFilter = "all" | FeedbackItem["status"];

const DEFAULT_PAGE_SIZE = 25;

type RecentFeedbackBySentimentProps = {
  items: FeedbackItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isDeleteMode?: boolean;
  listScope: FeedbackListScope;
  onListScopeChange: (scope: FeedbackListScope) => void;
  onRefresh: () => void;
  onDownloadAll: () => void;
  excelDownloadBusy?: boolean;
  onDownloadRange: (rows: FeedbackItem[]) => void;
  onDeleteItem?: (item: FeedbackItem) => void;
};

function matchesSentiment(item: FeedbackItem, filter: AiSentimentFilter): boolean {
  const bucket = getAiSentimentBucket(item);
  if (filter === "pending") return bucket === null;
  if (filter === "all") return true;
  return bucket === filter;
}

export function RecentFeedbackBySentiment({
  items,
  isLoading,
  isRefreshing,
  error,
  isDeleteMode = false,
  listScope,
  onListScopeChange,
  onRefresh,
  onDownloadAll,
  excelDownloadBusy = false,
  onDownloadRange,
  onDeleteItem,
}: RecentFeedbackBySentimentProps) {
  const navigate = useNavigate();
  const [sentimentFilter, setSentimentFilter] = useState<AiSentimentFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [encounterFilter, setEncounterFilter] = useState<EncounterTypeFilter>("all");
  const [draftFrom, setDraftFrom] = useState(listScope.from);
  const [draftTo, setDraftTo] = useState(listScope.to);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    setDraftFrom(listScope.from);
    setDraftTo(listScope.to);
  }, [listScope.from, listScope.to, listScope.allTime]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => b._id.localeCompare(a._id)),
    [items]
  );

  const departmentOptions = useMemo(
    () => uniqueSorted(sorted.map((i) => ticketDepartment(i) || i.department?.trim() || "")),
    [sorted]
  );

  const serviceOptions = useMemo(
    () => uniqueSorted(sorted.map(ticketService)),
    [sorted]
  );

  const filtered = useMemo(() => {
    return sorted.filter((item) => {
      if (!matchesSentiment(item, sentimentFilter)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      const dept = ticketDepartment(item) || item.department?.trim() || "";
      if (departmentFilter !== "all" && dept !== departmentFilter) return false;

      const svc = ticketService(item);
      if (serviceFilter !== "all" && svc !== serviceFilter) return false;

      if (!matchesEncounterType(item.patientEncounterType, encounterFilter)) return false;

      return true;
    });
  }, [sorted, sentimentFilter, statusFilter, departmentFilter, serviceFilter, encounterFilter]);

  const patientGroups = useMemo(() => buildPatientFeedbackGroups(filtered), [filtered]);

  useEffect(() => {
    setPage(1);
  }, [sentimentFilter, statusFilter, departmentFilter, serviceFilter, encounterFilter, pageSize, listScope]);

  const listScopeLabel = listScope.allTime
    ? "all time"
    : `${listScope.from} → ${listScope.to}`;

  function applyDraftRange() {
    if (!draftFrom || !draftTo) return;
    onListScopeChange({ from: draftFrom, to: draftTo, allTime: false });
  }

  function applyPreset(scope: FeedbackListScope) {
    onListScopeChange(scope);
  }

  const totalPages = getTotalPages(patientGroups.length, pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const visibleGroups = useMemo(
    () => paginateSlice(patientGroups, safePage, pageSize),
    [patientGroups, safePage, pageSize]
  );

  const hasActiveFilters =
    sentimentFilter !== "all" ||
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    serviceFilter !== "all" ||
    encounterFilter !== "all";

  const clearFilters = () => {
    setSentimentFilter("all");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setServiceFilter("all");
    setEncounterFilter("all");
  };

  const presetChip = (active: boolean) =>
    `rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
      active
        ? "bg-[#2A6FDB] text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  const selectClass = "h-9 w-full max-w-[200px] rounded-lg text-sm";

  const openDetail = (item: FeedbackItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <FeedbackDetailDialog
        item={detailItem}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailItem(null);
        }}
      />
      <div className="px-4 py-4 border-b border-gray-100 space-y-3">
        {isDeleteMode ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <span>Overview delete mode — each row has a Delete action.</span>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="text-xs font-semibold text-red-800 underline hover:no-underline"
            >
              Exit delete mode
            </button>
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800">Recent feedback</h3>
            <button
              type="button"
              disabled={isLoading || isRefreshing}
              onClick={onRefresh}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
            <span className="text-xs text-gray-500 tabular-nums">
              {filtered.length} in view · {patientGroups.length} patient
              {patientGroups.length !== 1 ? "s" : ""} · loaded {listScopeLabel}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!filtered.length}
              onClick={() => onDownloadRange(filtered)}
              className="h-9 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Download view (Excel)
            </button>
            <button
              type="button"
              disabled={excelDownloadBusy}
              onClick={onDownloadAll}
              className="h-9 px-3 rounded-lg bg-[#2A6FDB] text-white text-sm font-semibold hover:bg-[#1e5bbd] disabled:opacity-50"
            >
              {excelDownloadBusy ? "Preparing…" : "Download all time (Excel)"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide w-full sm:w-auto">
            Load period
          </span>
          <button
            type="button"
            className={presetChip(
              !listScope.allTime && listScope.from === last30DaysRange().from && listScope.to === last30DaysRange().to
            )}
            onClick={() => {
              const r = last30DaysRange();
              applyPreset({ from: r.from, to: r.to, allTime: false });
            }}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className={presetChip(
              !listScope.allTime &&
                listScope.from === last12WeeksRange().from &&
                listScope.to === last12WeeksRange().to
            )}
            onClick={() => {
              const r = last12WeeksRange();
              applyPreset({ from: r.from, to: r.to, allTime: false });
            }}
          >
            Last 12 weeks
          </button>
          <button
            type="button"
            className={presetChip(listScope.allTime)}
            onClick={() => applyPreset({ from: "", to: "", allTime: true })}
          >
            All time
          </button>
        </div>

        <EncounterTypeFilterTabs
          value={encounterFilter}
          onChange={setEncounterFilter}
          showHint
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              AI sentiment
            </label>
            <Select
              value={sentimentFilter}
              onValueChange={(v) => setSentimentFilter(v as AiSentimentFilter)}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="pending">Pending AI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              Status
            </label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="In Progress">In progress</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              Department
            </label>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {departmentOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              Service
            </label>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {serviceOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">From</label>
            <input
              type="date"
              value={draftFrom}
              disabled={listScope.allTime}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-9 px-2 border border-gray-200 rounded-lg text-sm w-[140px] disabled:bg-gray-50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">To</label>
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              disabled={listScope.allTime}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-9 px-2 border border-gray-200 rounded-lg text-sm w-[140px] disabled:bg-gray-50"
            />
          </div>

          <button
            type="button"
            disabled={listScope.allTime || !draftFrom || !draftTo || isLoading || isRefreshing}
            onClick={applyDraftRange}
            className="h-9 px-3 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-50"
          >
            Apply dates
          </button>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 px-3 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <p className="p-6 text-gray-600">Loading feedback…</p>
      ) : error ? (
        <p className="p-6 text-red-600">{error}</p>
      ) : !items.length ? (
        <p className="p-6 text-gray-600">No feedback submitted yet.</p>
      ) : !visibleGroups.length ? (
        <p className="p-6 text-gray-600">No rows match the selected filters.</p>
      ) : (
        <>
          <PatientGroupedFeedbackTable
            groups={visibleGroups}
            variant="overview"
            onViewItem={openDetail}
            onDeleteItem={onDeleteItem}
            emptyMessage="No feedback to show."
          />
          <ListPagination
            page={safePage}
            pageSize={pageSize}
            totalItems={patientGroups.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemLabel="patients"
          />
        </>
      )}
    </div>
  );
}
