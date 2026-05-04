import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getFeedback, seedOpenNegativeTickets, type FeedbackItem } from "../lib/api";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

export function AdminTicketsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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
    const interval = window.setInterval(() => {
      void loadTickets({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadTickets]);

  const sortedItems = useMemo(() => {
    const ticketRows = items.filter((item) => Boolean(item.ticketId));
    return [...ticketRows].sort((a, b) => b._id.localeCompare(a._id));
  }, [items]);

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
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/ticket/${item._id}`)}
                        className="px-3 py-2 rounded-lg bg-[#2A6FDB] text-white text-sm font-semibold hover:bg-[#1e5bbd] transition-colors"
                      >
                        View Ticket
                      </button>
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
