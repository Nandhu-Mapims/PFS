import React, { useEffect, useMemo, useRef, useState } from "react";
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
  assignFeedbackTicket,
  deleteFeedback,
  getFeedbackById,
  getUsers,
  resolveUploadUrl,
  type FeedbackItem,
  type UserRow,
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
import { ticketDepartment } from "../lib/ticketFilters";

function userDepartmentName(user: UserRow): string {
  if (user.departmentId && typeof user.departmentId === "object" && "name" in user.departmentId) {
    return user.departmentId.name.trim();
  }
  return "";
}

function sortHodAssignees(
  hods: UserRow[],
  ticket: FeedbackItem | null,
  defaultHodId: string | null
): UserRow[] {
  const ticketDept = ticket ? ticketDepartment(ticket).trim().toLowerCase() : "";
  return [...hods].sort((a, b) => {
    const rank = (u: UserRow) => {
      if (defaultHodId && u._id === defaultHodId) return 0;
      if (ticketDept && userDepartmentName(u).toLowerCase() === ticketDept) return 1;
      return 2;
    };
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.username.localeCompare(b.username);
  });
}

function defaultHodForTicket(hodUsers: UserRow[], ticket: FeedbackItem | null): string | null {
  if (!ticket) return null;
  const ticketDept = ticketDepartment(ticket).trim().toLowerCase();
  if (!ticketDept) return null;

  const fromUserDept = hodUsers.find(
    (u) => userDepartmentName(u).trim().toLowerCase() === ticketDept
  );
  return fromUserDept?._id ?? null;
}

function feedbackSourceLabel(source: string | undefined): string {
  if (source === "staff") return "Patient (collected at desk)";
  if (source === "ai") return "AI channel";
  return "Patient";
}

export function TicketDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [ticket, setTicket] = useState<FeedbackItem | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const assignSuggestDone = useRef<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [status, setStatus] = useState<FeedbackItem["status"]>("New");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const isHod = session?.role === "hod";
  const canUpdateStatus = isHod;
  const showDeleteAction = location.pathname.includes("/delete");

  useEffect(() => {
    if (!isAdmin) return;
    void getUsers()
      .then((userRows) => setUsers(userRows.filter((u) => u.role === "hod")))
      .catch(() => setUsers([]));
  }, [isAdmin]);

  const hodUsers = users;

  const defaultHodId = useMemo(
    () => defaultHodForTicket(hodUsers, ticket),
    [hodUsers, ticket]
  );

  const hodAssignees = useMemo(
    () => sortHodAssignees(hodUsers, ticket, defaultHodId),
    [hodUsers, ticket, defaultHodId]
  );

  const currentAssigneeIsHod = useMemo(() => {
    if (!ticket?.assignedToUserId) return true;
    return hodUsers.some((h) => h._id === ticket.assignedToUserId);
  }, [ticket, hodUsers]);

  const defaultHodUser = useMemo(
    () => hodAssignees.find((u) => u._id === defaultHodId) ?? null,
    [hodAssignees, defaultHodId]
  );

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
        const assignedId = row.assignedToUserId || "";
        setAssigneeId(assignedId);
        assignSuggestDone.current = null;
      } catch {
        setError("Could not load ticket details.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadTicket();
  }, [id]);

  useEffect(() => {
    if (!ticket || !isAdmin || ticket.assignedToUserId) return;
    if (assignSuggestDone.current === ticket._id) return;
    if (!defaultHodId) {
      assignSuggestDone.current = ticket._id;
      return;
    }
    setAssigneeId(defaultHodId);
    assignSuggestDone.current = ticket._id;
  }, [ticket, isAdmin, defaultHodId]);

  async function handleAssign(userId: string | null) {
    if (!ticket) return;
    try {
      setIsSaving(true);
      setError(null);
      const updated = await assignFeedbackTicket(ticket._id, userId);
      setTicket(updated);
      setAssigneeId(updated.assignedToUserId || "");
    } catch {
      setError("Could not update assignment.");
    } finally {
      setIsSaving(false);
    }
  }

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

  const isAssignedToHod = Boolean(
    ticket?.assignedToUserId &&
      ticket?.assignedToUsername?.trim() &&
      (isAdmin ? currentAssigneeIsHod : true)
  );
  const assignedAtLabel = ticket?.assignedAt
    ? new Date(ticket.assignedAt).toLocaleString()
    : isAssignedToHod
      ? "Assigned"
      : "Pending";

  const timelineItems = useMemo(() => {
    if (!ticket) return [];
    return [
      {
        event: "Feedback Submitted",
        status: "completed" as const,
        time: createdAt?.toLocaleString() || "-",
      },
      {
        event: "Ticket Created",
        status: "completed" as const,
        time: createdAt?.toLocaleString() || "-",
      },
      {
        event: isAssignedToHod
          ? `Assigned to HOD · ${ticket.assignedToUsername?.trim()}`
          : "Assigned to HOD",
        status: isAssignedToHod ? ("completed" as const) : ("pending" as const),
        time: isAssignedToHod
          ? assignedAtLabel
          : !currentAssigneeIsHod && ticket.assignedToUserId
            ? "Invalid assignee — reassign to HOD"
            : "Pending",
      },
      {
        event: "In Progress",
        status:
          ticket.status === "In Progress" || ticket.status === "Resolved"
            ? ("completed" as const)
            : ("pending" as const),
        time:
          ticket.status === "In Progress" || ticket.status === "Resolved"
            ? "Updated"
            : "Pending",
      },
      {
        event: "Resolved",
        status: ticket.status === "Resolved" ? ("completed" as const) : ("pending" as const),
        time: ticket.status === "Resolved" ? "Updated" : "Pending",
      },
    ];
  }, [ticket, createdAt, isAssignedToHod, assignedAtLabel, currentAssigneeIsHod]);

  const assignButtonLabel = !assigneeId
    ? ticket?.assignedToUserId
      ? "Unassign"
      : "Unassigned"
    : !ticket?.assignedToUserId
      ? "Assign"
      : assigneeId !== ticket.assignedToUserId
        ? "Reassign to HOD"
        : "Current HOD";

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
                <p className="text-base font-semibold text-gray-800">
                  {feedbackSourceLabel(ticket.source)}
                </p>
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
                      Voice audio (what the patient spoke)
                    </p>
                    <audio controls className="w-full max-w-xl" preload="metadata" src={voiceAudioSrc!}>
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                ) : null}

                {!speechToTextText && !hasVoiceCapture ? (
                  <p className="text-gray-700 leading-relaxed">No comment provided.</p>
                ) : null}
              </div>
            )}

          </div>

          {ticket.staffRemarks?.trim() ? (
            <div className="bg-amber-50 rounded-xl p-6 border border-amber-200 shadow-sm">
              <h3 className="text-lg font-semibold text-amber-900 mb-2">Staff remarks</h3>
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{ticket.staffRemarks.trim()}</p>
            </div>
          ) : null}

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

        </div>

        {/* Right Column - Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            {isAdmin ? (
              <>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Assign to HOD</h3>
                {!ticket.assignedToUserId && ticketDepartment(ticket) && defaultHodUser ? (
                  <p className="text-xs text-emerald-700 mb-3">
                    Suggested HOD for {ticketDepartment(ticket)}:{" "}
                    <span className="font-semibold">{defaultHodUser.username}</span>
                  </p>
                ) : !ticket.assignedToUserId && ticketDepartment(ticket) ? (
                  <p className="text-xs text-amber-700 mb-3">
                    No HOD for {ticketDepartment(ticket)}. Create one in Admin → Users, or pick any HOD
                    below.
                  </p>
                ) : null}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {ticket.assignedToUserId ? "Reassign to another HOD" : "Select HOD"}
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none mb-3"
                >
                  <option value="">Unassigned</option>
                  {hodAssignees.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.username}
                      {userDepartmentName(u) ? ` · ${userDepartmentName(u)}` : ""}
                      {u._id === defaultHodId ? " · Department HOD" : ""}
                    </option>
                  ))}
                </select>
                {hodAssignees.length === 0 ? (
                  <p className="text-xs text-amber-700 mb-3">
                    No HOD users yet. Create one under Admin → Users.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleAssign(assigneeId || null)}
                  disabled={isSaving || assigneeId === (ticket.assignedToUserId || "")}
                  className="w-full bg-[#2A6FDB] text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : assignButtonLabel}
                </button>
              </>
            ) : null}

            <div className={isAdmin ? "mt-6 pt-6 border-t border-gray-100" : ""}>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Timeline</h3>
              <div className="space-y-4">
                {timelineItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        item.status === "completed" ? "bg-[#2FBF71]" : "bg-gray-300"
                      }`}
                    >
                      {item.status === "completed" ? (
                        <CheckCircle size={18} className="text-white" />
                      ) : (
                        <div className="w-2.5 h-2.5 bg-white rounded-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-semibold text-sm ${
                          item.status === "completed" ? "text-gray-800" : "text-gray-400"
                        }`}
                      >
                        {item.event}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {isAdmin && showDeleteAction && (
            <div className="bg-white rounded-xl p-6 border border-red-200 shadow-sm">
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="w-full px-4 py-3 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors text-sm font-bold"
              >
                Delete Ticket
              </button>
            </div>
          )}

          {canUpdateStatus && (
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Update Status</h3>
            {isHod ? (
              <p className="text-sm text-gray-600 mb-4">
                Update progress after you review this ticket.
              </p>
            ) : null}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as FeedbackItem["status"])}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none mb-4"
            >
              <option value="New">New</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>

            <button
              onClick={handleSave}
              disabled={isSaving || status === ticket.status}
              className="w-full bg-[#2FBF71] text-white py-3 rounded-lg font-bold shadow-lg hover:bg-[#28a962] hover:shadow-xl hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2"
            >
              <Save size={20} />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          )}

        </div>
      </div>
      </>
      )}
    </div>
  );
}
