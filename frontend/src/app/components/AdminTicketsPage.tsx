import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  deleteFeedback,
  getFeedback,
  getTmsHealth,
  seedOpenNegativeTickets,
  syncFeedbackToTms,
  type FeedbackItem,
  type TmsHealth,
} from "../lib/api";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

export function AdminTicketsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tmsHealth, setTmsHealth] = useState<TmsHealth | null>(null);
  const [tmsRowSyncing, setTmsRowSyncing] = useState<string | null>(null);
  const [autoSyncingIds, setAutoSyncingIds] = useState<Record<string, boolean>>({});

  const loadTickets = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (opts?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const data = await getFeedback();
      setItems(data);
    } catch {
      setError("Failed to load tickets. Please check API and database.");
    } finally {
      if (opts?.silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const handleOpenNegativeTickets = useCallback(async () => {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      setError(null);
      const result = await seedOpenNegativeTickets();
      setSyncMessage(
        `Updated ${result.updated} row(s). ${result.negativeWithTicket} negative item(s) now have tickets.`
      );
      await loadTickets({ silent: true });
    } catch {
      setError("Could not assign tickets. Is the API running?");
    } finally {
      setIsSyncing(false);
    }
  }, [loadTickets]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await getTmsHealth();
        if (!cancelled) setTmsHealth(h);
      } catch {
        if (!cancelled) setTmsHealth({ configured: false, message: "TMS check failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadTickets({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadTickets]);

  const handleSyncRowToTms = useCallback(
    async (item: FeedbackItem) => {
      const key = item._id;
      try {
        setTmsRowSyncing(key);
        setError(null);
        const result = await syncFeedbackToTms(item._id);
        setItems((current) =>
          current.map((row) => (row._id === key ? { ...row, ...result.feedback } : row))
        );
        if (!result.ok) {
          setError(
            result.feedback?.tmsSyncError ||
              "TMS rejected the ticket. Check service-account access in backend logs."
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "TMS sync failed");
      } finally {
        setTmsRowSyncing(null);
      }
    },
    []
  );

  useEffect(() => {
    if (!tmsHealth?.configured || !tmsHealth?.reachable) return;
    const pending = items.filter(
      (item) => Boolean(item.ticketId) && !item.tmsTicketId && !autoSyncingIds[item._id]
    );
    if (!pending.length) return;

    pending.slice(0, 5).forEach((item) => {
      setAutoSyncingIds((prev) => ({ ...prev, [item._id]: true }));
      void syncFeedbackToTms(item._id)
        .then((result) => {
          setItems((current) =>
            current.map((row) => (row._id === item._id ? { ...row, ...result.feedback } : row))
          );
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "TMS auto-sync failed");
        })
        .finally(() => {
          setAutoSyncingIds((prev) => {
            const next = { ...prev };
            delete next[item._id];
            return next;
          });
        });
    });
  }, [autoSyncingIds, items, tmsHealth]);

  const sortedItems = useMemo(() => {
    const ticketRows = items.filter((item) => Boolean(item.ticketId));
    return [...ticketRows].sort((a, b) => b._id.localeCompare(a._id));
  }, [items]);
  const showDeleteActions = location.pathname.includes("/delete");

  const handleDelete = useCallback(
    async (item: FeedbackItem) => {
      const confirmed = window.confirm(
        `Delete ticket ${item.ticketId ?? item._id}? This action cannot be undone.`
      );
      if (!confirmed) return;
      try {
        setError(null);
        await deleteFeedback(item._id);
        setItems((current) => current.filter((row) => row._id !== item._id));
      } catch {
        setError("Failed to delete ticket.");
      }
    },
    []
  );

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800">Ticket Management</h2>
          <p className="text-base md:text-lg text-gray-600 mt-2">
            Tickets include critical star ratings and AI-negative sentiment. Use “Open tickets for AI-negative”
            if older feedback already has Groq sentiment but no ticket ID yet.
          </p>
        </div>
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2 justify-end">
          Total tickets: <span className="font-bold text-gray-800">{sortedItems.length}</span>
          <button
            type="button"
            onClick={() => void loadTickets({ silent: true })}
            disabled={isLoading || isRefreshing}
            className="px-3 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void handleOpenNegativeTickets()}
            disabled={isLoading || isSyncing}
            className="px-3 py-1 rounded-lg border border-[#2A6FDB] text-xs font-semibold text-[#2A6FDB] hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Assign ticket IDs to feedback where AI sentiment is negative (requires Groq analysis on those rows)"
          >
            {isSyncing ? "Syncing…" : "Open tickets for AI-negative"}
          </button>
        </div>
      </div>

      {syncMessage && (
        <p className="text-sm text-[#2FBF71] mb-4" role="status">
          {syncMessage}
        </p>
      )}

      {tmsHealth && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm border ${
            tmsHealth.configured && tmsHealth.reachable
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : tmsHealth.configured
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-gray-50 border-gray-200 text-gray-700"
          }`}
        >
          <strong>TMS:</strong>{" "}
          {tmsHealth.configured
            ? tmsHealth.reachable
              ? "Connected. New negative-feedback tickets will be created in TMS automatically."
              : "Configured but unreachable. Check TMS_API_BASE_URL and that the TMS server is running."
            : tmsHealth.message ||
              "Not configured. Set TMS_API_BASE_URL in Feedback backend/.env (e.g. https://tms.mapims.edu.in/api)."}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-gray-600">Loading tickets...</p>
        ) : error ? (
          <p className="p-6 text-red-600">{error}</p>
        ) : !sortedItems.length ? (
          <p className="p-6 text-gray-600">No tickets available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F5F7FA]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Ticket ID</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Patient</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Department</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">AI sentiment</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Rating</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">TMS</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Submitted</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedItems.map((item) => (
                  <tr key={item._id} className="hover:bg-[#F5F7FA] transition-colors">
                    <td className="px-6 py-4 font-mono text-sm text-gray-800">
                      {item.ticketId ?? item._id}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-800">{item.patientName}</td>
                    <td className="px-6 py-4 text-gray-600">{item.department?.trim() || "—"}</td>
                    <td className="px-6 py-4 text-gray-600 capitalize">
                      {item.aiSentiment ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {item.rating} - {ratingLabel[item.rating] ?? "N/A"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{item.status}</td>
                    <td className="px-6 py-4 text-sm">
                      {item.tmsTicketNumber || item.tmsTicketId ? (
                        <div className="flex flex-col">
                          {item.tmsTicketUrl ? (
                            <a
                              href={item.tmsTicketUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-mono text-[#2A6FDB] hover:underline"
                            >
                              {item.tmsTicketNumber || item.tmsTicketId}
                            </a>
                          ) : (
                            <span className="font-mono text-emerald-700">
                              {item.tmsTicketNumber || item.tmsTicketId}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-500">
                            {item.tmsSyncedAt
                              ? `synced ${new Date(item.tmsSyncedAt).toLocaleString()}`
                              : "synced"}
                          </span>
                        </div>
                      ) : tmsHealth?.configured ? (
                        <span
                          className="inline-flex px-2 py-1 rounded border border-amber-300 text-amber-800 text-xs font-semibold"
                          title={item.tmsSyncError || "Auto-syncing to TMS"}
                        >
                          {autoSyncingIds[item._id] || tmsRowSyncing === item._id
                            ? "Auto-syncing…"
                            : item.tmsSyncError
                              ? "Auto-sync failed"
                              : "Pending auto-sync"}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/ticket/${item._id}`)}
                          className="px-3 py-2 rounded-lg bg-[#2A6FDB] text-white text-sm font-semibold hover:bg-[#1e5bbd] transition-colors"
                        >
                          View Ticket
                        </button>
                        {showDeleteActions && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            className="px-3 py-2 rounded-lg bg-[#E5533D] text-white text-sm font-semibold hover:bg-[#d43e29] transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
