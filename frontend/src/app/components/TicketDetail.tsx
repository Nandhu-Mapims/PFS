import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, User, Calendar, Building2, AlertCircle, Save, MessageSquare, CheckCircle } from "lucide-react";
import { getFeedbackById, type FeedbackItem, updateFeedbackStatus } from "../lib/api";
import { getSession } from "../lib/auth";

export function TicketDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [ticket, setTicket] = useState<FeedbackItem | null>(null);
  const [status, setStatus] = useState<FeedbackItem["status"]>("New");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = getSession();
  const isAdmin = session?.role === "admin";

  useEffect(() => {
    async function loadTicket() {
      if (!id) {
        setError("Missing ticket id");
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        const row = await getFeedbackById(id);
        setTicket(row);
        setStatus(row.status);
      } catch {
        setError("Could not load ticket details.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadTicket();
  }, [id]);

  async function handleSave() {
    if (!ticket || !id) return;
    try {
      setIsSaving(true);
      const updated = await updateFeedbackStatus(ticket._id, status);
      setTicket(updated);
    } catch {
      setError("Could not update ticket status.");
    } finally {
      setIsSaving(false);
    }
  }

  const createdAt = ticket ? new Date(ticket.createdAt) : null;
  const sentimentNegative = ticket?.aiSentiment === "negative";
  const sentimentPositive = ticket?.aiSentiment === "positive";
  const sentimentNeutral = ticket?.aiSentiment === "neutral";
  const noAiSentiment = ticket && !ticket.aiSentiment;
  const fallbackAiSummary = ticket
    ? noAiSentiment
      ? "AI sentiment is not available yet. Review the comment text and patient rating, then follow your local escalation policy."
      : sentimentNegative
        ? "AI detected negative tone in the comments. Recommended: follow up with the patient and assign a department owner."
        : "Monitor trends and close the ticket once reviewed."
    : "";
  const aiSummary = ticket?.aiSummary?.trim() || fallbackAiSummary;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate(isAdmin ? "/admin/tickets" : "/dashboard")}
        className="flex items-center gap-2 text-gray-600 hover:text-blue-600 mb-6 text-lg"
      >
        <ArrowLeft size={20} />
        {isAdmin ? "Back to Ticket Management" : "Back to Dashboard"}
      </button>

      {isLoading ? (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm text-gray-600">
          Loading ticket details...
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm text-red-600">
          {error}
        </div>
      ) : !ticket ? (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm text-gray-600">
          Ticket not found.
        </div>
      ) : (
        <>

      {/* Header */}
      <div className="bg-white rounded-xl p-6 mb-6 border border-gray-200 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-3xl font-semibold text-gray-800 mb-2">
              Ticket {ticket.ticketId || ticket._id}
            </h2>
            <div className="flex flex-wrap gap-3">
              <span
                className={`px-4 py-2 rounded-full text-sm font-bold text-white ${
                  sentimentNegative
                    ? "bg-[#E5533D]"
                    : sentimentPositive
                      ? "bg-[#2FBF71]"
                      : sentimentNeutral
                        ? "bg-[#F4A261]"
                        : "bg-gray-500"
                }`}
              >
                {ticket.aiSentiment
                  ? `AI sentiment: ${ticket.aiSentiment}`
                  : "AI sentiment: pending"}
              </span>
              <span className="px-4 py-2 rounded-full text-sm font-bold bg-[#94a3b8] text-white">
                Rating: {ticket.rating}/5
              </span>
              {(ticket.rating ?? 0) <= 2 && (
                <span className="px-4 py-2 rounded-full text-sm font-bold bg-[#E5533D] text-white">
                  Low satisfaction score
                </span>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>{createdAt?.toLocaleDateString()}</p>
            <p>{createdAt?.toLocaleTimeString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Patient Info & Feedback */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient Information */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User size={24} className="text-blue-600" />
              Patient Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Name</p>
                <p className="text-base font-semibold text-gray-800">{ticket.patientName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Source</p>
                <p className="text-base font-semibold text-gray-800 capitalize">{ticket.source}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Department</p>
                <p className="text-base font-semibold text-gray-800">{ticket.department || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Current Status</p>
                <p className="text-base font-semibold text-gray-800">{ticket.status}</p>
              </div>
            </div>
          </div>

          {/* Feedback */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <MessageSquare size={24} className="text-green-600" />
              Patient Feedback
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-gray-700 leading-relaxed">{ticket.comments || "No comment provided."}</p>
            </div>
          </div>

          {/* AI Analysis (Groq when configured on API) */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border-2 border-[#2A6FDB] shadow-sm">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertCircle size={24} className="text-[#2A6FDB]" />
              AI Sentiment Analysis
            </h3>
            {(ticket.aiSentiment || ticket.aiUrgency) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {ticket.aiSentiment && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white border border-[#2A6FDB] text-[#2A6FDB] capitalize">
                    {ticket.aiSentiment}
                  </span>
                )}
                {ticket.aiUrgency && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white border border-[#F4A261] text-[#92400e] capitalize">
                    Urgency: {ticket.aiUrgency}
                  </span>
                )}
              </div>
            )}
            <p className="text-gray-700 leading-relaxed font-medium">{aiSummary}</p>
            {ticket.aiTopics && ticket.aiTopics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {ticket.aiTopics.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-1 rounded-md text-xs bg-white/80 border border-gray-200 text-gray-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Timeline</h3>
            <div className="space-y-4">
              {[
                { event: "Feedback Submitted", status: "completed", time: createdAt?.toLocaleString() || "-" },
                { event: "Ticket Created", status: "completed", time: createdAt?.toLocaleString() || "-" },
                {
                  event: "In Progress",
                  status: ticket.status === "In Progress" || ticket.status === "Resolved" ? "completed" : "pending",
                  time: ticket.status === "In Progress" || ticket.status === "Resolved" ? "Updated" : "Pending",
                },
                {
                  event: "Resolved",
                  status: ticket.status === "Resolved" ? "completed" : "pending",
                  time: ticket.status === "Resolved" ? "Updated" : "Pending",
                },
              ].map((item, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    item.status === "completed" ? "bg-[#2FBF71]" : "bg-gray-300"
                  }`}>
                    {item.status === "completed" ? (
                      <CheckCircle size={20} className="text-white" />
                    ) : (
                      <div className="w-3 h-3 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold ${item.status === "completed" ? "text-gray-800" : "text-gray-400"}`}>
                      {item.event}
                    </p>
                    <p className="text-sm text-gray-600">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Actions */}
        <div className="space-y-6">
          {/* Status Update */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Update Status</h3>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none mb-4"
            >
              <option value="New">New</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>

            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Add Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add internal notes or comments..."
              className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-none mb-4"
            />

            <button
              onClick={handleSave}
              disabled={isSaving || status === ticket.status}
              className="w-full bg-[#2FBF71] text-white py-3 rounded-lg font-bold shadow-lg hover:bg-[#28a962] hover:shadow-xl hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2"
            >
              <Save size={20} />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full px-4 py-3 bg-[#2A6FDB] text-white rounded-lg hover:bg-[#1e5bbd] transition-colors text-sm font-bold">
                Send Follow-up Email
              </button>
              <button className="w-full px-4 py-3 bg-[#2FBF71] text-white rounded-lg hover:bg-[#28a962] transition-colors text-sm font-bold">
                Call Patient
              </button>
              <button className="w-full px-4 py-3 bg-[#E5533D] text-white rounded-lg hover:bg-[#d43e29] transition-colors text-sm font-bold">
                Escalate to Manager
              </button>
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
