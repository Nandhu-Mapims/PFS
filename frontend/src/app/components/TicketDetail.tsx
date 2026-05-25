import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  User,
  Building2,
  AlertCircle,
  Save,
  MessageSquare,
  CheckCircle,
  Mic,
} from "lucide-react";
import {
  deleteFeedback,
  getFeedbackById,
  resolveUploadUrl,
  type FeedbackItem,
  updateFeedbackStatus,
} from "../lib/api";
import { BotConversationFeedbackSection } from "./BotConversationFeedbackSection";
import { displayOptionalLabel } from "../lib/fieldSanitize";
import {
  displaySentimentForItem,
  effectiveFeedbackMode,
  feedbackModeLabel,
} from "../lib/feedbackDisplay";
import { getSession } from "../lib/auth";

export function TicketDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [ticket, setTicket] = useState<FeedbackItem | null>(null);
  const [status, setStatus] = useState<FeedbackItem["status"]>("New");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const showDeleteAction = location.pathname.includes("/delete");

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

  async function handleDelete() {
    if (!ticket) return;
    const confirmed = window.confirm(
      `Delete ticket ${ticket.ticketId || ticket._id}? This action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      setError(null);
      await deleteFeedback(ticket._id);
      navigate(isAdmin ? "/admin/tickets/delete" : "/dashboard");
    } catch {
      setError("Could not delete ticket.");
    }
  }

  const createdAt = ticket ? new Date(ticket.createdAt) : null;
  const rowSentiment = ticket ? displaySentimentForItem(ticket) : null;
  const sentimentNegative = rowSentiment === "negative";
  const sentimentPositive = rowSentiment === "positive";
  const sentimentNeutral = rowSentiment === "neutral";
  const noAiSentiment = ticket && !ticket.aiSentiment;
  const fallbackAiSummary = ticket
    ? noAiSentiment
      ? "AI sentiment is not available yet. Review the comment text and patient rating, then follow your local escalation policy."
      : sentimentNegative
        ? "AI detected negative tone in the comments. Recommended: follow up with the patient and assign a department owner."
        : "Monitor trends and close the ticket once reviewed."
    : "";
  const aiSummary = ticket?.aiSummary?.trim() || fallbackAiSummary;

  const voiceAudioSrc = resolveUploadUrl(ticket?.voiceRecordingUrl ?? null);
  const displayMode = ticket ? effectiveFeedbackMode(ticket) : "standard";
  const botAnswers = ticket?.botConversationAnswers ?? [];
  const hasBotConversation =
    (displayMode === "bot" || botAnswers.length > 0) && botAnswers.length > 0;
  const hasVoiceCapture = Boolean(voiceAudioSrc);
  const speechToTextText = ticket?.comments?.trim() || "";
  const botGroupNote =
    ticket?.isSplitChild && hasBotConversation
      ? "Full bot conversation for this patient (all questions). This ticket covers one service from that session."
      : ticket?.botVoiceSourceFeedbackId && hasBotConversation
        ? "Voice Q&A loaded from the linked bot submission for this patient."
        : null;

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
                {rowSentiment ? `AI sentiment: ${rowSentiment}` : "AI sentiment: pending"}
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
                <p className="text-sm text-gray-600 mb-1">Feedback type</p>
                <p className="text-base font-semibold text-gray-800">{feedbackModeLabel[displayMode]}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">UHID / Reg. no.</p>
                <p className="text-base font-semibold text-gray-800">{ticket.patientRegNo?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Visit type</p>
                <p className="text-base font-semibold text-gray-800 uppercase">
                  {ticket.patientEncounterType === "op"
                    ? "OP"
                    : ticket.patientEncounterType === "ip"
                      ? "IP"
                      : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Department (UHID / EMR)</p>
                <p className="text-base font-semibold text-gray-800">
                  {displayOptionalLabel(ticket.lookupDepartment || ticket.department)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Recommended service</p>
                <p className="text-base font-semibold text-gray-800">
                  {displayOptionalLabel(ticket.service)}
                </p>
              </div>
              {ticket.suggestedAction?.trim() ? (
                <div className="col-span-2">
                  <p className="text-sm text-gray-600 mb-1">Suggested action</p>
                  <p className="text-base font-semibold text-gray-800">{ticket.suggestedAction}</p>
                </div>
              ) : null}
              <div>
                <p className="text-sm text-gray-600 mb-1">Ward</p>
                <p className="text-base font-semibold text-gray-800">{ticket.ward?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">IP number</p>
                <p className="text-base font-semibold text-gray-800">{ticket.ipNo?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Visit / admission date</p>
                <p className="text-base font-semibold text-gray-800">{ticket.visitOrAdmissionDate?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Current Status</p>
                <p className="text-base font-semibold text-gray-800">{ticket.status}</p>
              </div>
            </div>
          </div>

          {/* Feedback — speech-to-text + voice audio */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <MessageSquare size={24} className="text-green-600" />
              Patient Feedback
            </h3>

            {hasBotConversation ? (
              <BotConversationFeedbackSection
                answers={botAnswers}
                combinedSessionUrl={ticket.voiceRecordingUrl}
                fullTranscript={speechToTextText}
                groupNote={botGroupNote}
              />
            ) : (
              <div className="space-y-5">
                {(displayMode === "voice" || speechToTextText) && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-[#2A6FDB] uppercase tracking-wide mb-2">
                      Speech-to-text {displayMode === "voice" ? "(Sarvam — converted from voice)" : ""}
                    </p>
                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {speechToTextText || "No transcript stored."}
                    </p>
                  </div>
                )}

                {hasVoiceCapture ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Mic size={14} />
                      Voice recording (what the patient spoke)
                    </p>
                    <audio controls className="w-full max-w-xl" preload="metadata" src={voiceAudioSrc!}>
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                ) : displayMode === "voice" ? (
                  <p className="text-sm text-amber-700 rounded-lg border border-amber-100 bg-amber-50 p-3">
                    Voice feedback was submitted but no audio file is stored on the server for this ticket.
                  </p>
                ) : null}

                {!speechToTextText && !hasVoiceCapture ? (
                  <p className="text-gray-700 leading-relaxed">No comment provided.</p>
                ) : null}
              </div>
            )}

          </div>

          {/* AI Analysis (OpenRouter when configured on API) */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border-2 border-[#2A6FDB] shadow-sm">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertCircle size={24} className="text-[#2A6FDB]" />
              AI Sentiment Analysis
            </h3>
            {(ticket.aiSentiment || ticket.aiUrgency) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {rowSentiment && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white border border-[#2A6FDB] text-[#2A6FDB] capitalize">
                    {rowSentiment}
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

          {ticket.feedbackIssues && ticket.feedbackIssues.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Building2 size={24} className="text-blue-600" />
                Categorized issues
                {ticket.feedbackIssues.length > 1 ? (
                  <span className="text-sm font-normal text-gray-500">
                    ({ticket.feedbackIssues.length} departments / services)
                  </span>
                ) : null}
              </h3>
              <div className="space-y-4">
                {ticket.feedbackIssues.map((issue, idx) => (
                  <div
                    key={`${issue.department}-${issue.recommendedService}-${idx}`}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500 mb-0.5">Department</p>
                        <p className="font-semibold text-gray-800">
                          {displayOptionalLabel(issue.department)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-0.5">Recommended service</p>
                        <p className="font-semibold text-gray-800">
                          {displayOptionalLabel(issue.recommendedService)}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-gray-500 mb-0.5">Issue summary</p>
                        <p className="text-gray-800">{issue.issueSummary || "—"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-gray-500 mb-0.5">Suggested action</p>
                        <p className="text-gray-800">{issue.suggestedAction || "—"}</p>
                      </div>
                      {issue.ticketId ? (
                        <div>
                          <p className="text-gray-500 mb-0.5">Ticket</p>
                          <p className="font-mono font-semibold text-gray-800">{issue.ticketId}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              {showDeleteAction && (
                <button
                  onClick={() => void handleDelete()}
                  className="w-full px-4 py-3 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors text-sm font-bold"
                >
                  Delete Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
