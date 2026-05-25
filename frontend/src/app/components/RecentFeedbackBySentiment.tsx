import { useMemo, useState } from "react";
import type { FeedbackItem } from "../lib/api";
import { getAiSentimentBucket } from "../lib/sentiment";
import { ticketDepartment, ticketService, uniqueSorted } from "../lib/ticketFilters";
import { FeedbackDetailDialog } from "./FeedbackDetailDialog";
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

const ROW_LIMIT = 25;

type RecentFeedbackBySentimentProps = {
  items: FeedbackItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onDownloadAll: () => void;
  onDownloadRange: (rows: FeedbackItem[]) => void;
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
  onRefresh,
  onDownloadAll,
  onDownloadRange,
}: RecentFeedbackBySentimentProps) {
  const [sentimentFilter, setSentimentFilter] = useState<AiSentimentFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

      if (fromDate || toDate) {
        const created = new Date(item.createdAt);
        if (fromDate) {
          const start = new Date(`${fromDate}T00:00:00`);
          if (created < start) return false;
        }
        if (toDate) {
          const end = new Date(`${toDate}T23:59:59.999`);
          if (created > end) return false;
        }
      }
      return true;
    });
  }, [sorted, sentimentFilter, statusFilter, departmentFilter, serviceFilter, fromDate, toDate]);

  const patientGroups = useMemo(() => buildPatientFeedbackGroups(filtered), [filtered]);
  const visibleGroups = patientGroups.slice(0, ROW_LIMIT);
  const visibleRowCount = visibleGroups.reduce((n, g) => n + g.items.length, 0);

  const hasActiveFilters =
    sentimentFilter !== "all" ||
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    serviceFilter !== "all" ||
    Boolean(fromDate || toDate);

  const clearFilters = () => {
    setSentimentFilter("all");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setServiceFilter("all");
    setFromDate("");
    setToDate("");
  };

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
              {visibleGroups.length} patient{visibleGroups.length !== 1 ? "s" : ""}
              {visibleRowCount !== filtered.length ? ` · ${visibleRowCount} rows shown` : ""}
              {patientGroups.length !== visibleGroups.length
                ? ` of ${patientGroups.length} patients`
                : ""}
              {filtered.length !== items.length ? ` (${items.length} total)` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!fromDate || !toDate || !filtered.length}
              onClick={() => onDownloadRange(filtered)}
              className="h-9 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Download filtered (CSV)
            </button>
            <button
              type="button"
              disabled={!items.length}
              onClick={onDownloadAll}
              className="h-9 px-3 rounded-lg bg-[#2A6FDB] text-white text-sm font-semibold hover:bg-[#1e5bbd] disabled:opacity-50"
            >
              Download all (CSV)
            </button>
          </div>
        </div>

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
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 px-2 border border-gray-200 rounded-lg text-sm w-[140px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">To</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 px-2 border border-gray-200 rounded-lg text-sm w-[140px]"
            />
          </div>

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
        <PatientGroupedFeedbackTable
          groups={visibleGroups}
          variant="overview"
          onViewItem={openDetail}
          emptyMessage="No feedback to show."
        />
      )}
    </div>
  );
}
