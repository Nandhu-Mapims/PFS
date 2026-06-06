import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import type { FeedbackItem } from "../lib/api";
import { BotConversationFeedbackSection } from "./BotConversationFeedbackSection";
import { resolveUploadUrl } from "../lib/api";
import {
  displaySentimentForItem,
  effectiveFeedbackMode,
  feedbackModeLabel,
  ticketAiSummaryForItem,
} from "../lib/feedbackDisplay";
import { filterAiTopicsForTranscript } from "../lib/aiTopicsFilter";
import { ticketDepartment, ticketService } from "../lib/ticketFilters";
import { displayOptionalLabel } from "../lib/fieldSanitize";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

function audioSrc(url: string | null | undefined): string | null {
  return resolveUploadUrl(url ?? null);
}

type FeedbackDetailDialogProps = {
  item: FeedbackItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeedbackDetailDialog({ item, open, onOpenChange }: FeedbackDetailDialogProps) {
  if (!item) return null;

  const voiceSrc = audioSrc(item.voiceRecordingUrl);
  const botAnswers = [...(item.botConversationAnswers ?? [])].sort(
    (a, b) => a.questionOrder - b.questionOrder
  );
  const displayMode = effectiveFeedbackMode(item);
  const isBot = displayMode === "bot" && botAnswers.length > 0;
  const hasVoice = Boolean(voiceSrc);
  const transcript = item.comments?.trim() || "";
  const ticketSummary = ticketAiSummaryForItem(item);
  const transcriptFallbackSummary = transcript
    ? `${transcript.replace(/\s+/g, " ").trim().slice(0, 220)}${
        transcript.length > 220 ? "..." : ""
      }`
    : "";
  const aiSummary =
    ticketSummary ||
    (item.aiSentiment
      ? `AI sentiment: ${item.aiSentiment}. Review the full feedback below.`
      : transcriptFallbackSummary || "AI summary not generated yet.");
  const displayTopics = filterAiTopicsForTranscript(item.aiTopics, transcript);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Feedback details</DialogTitle>
          <p className="text-sm text-gray-500">
            {item.patientName} · {new Date(item.createdAt).toLocaleString()}
            {item.ticketId ? ` · ${item.ticketId}` : ""}
          </p>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-700">
              {feedbackModeLabel[displayMode]}
            </span>
            <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-700">
              Rating: {item.rating} · {ratingLabel[item.rating] ?? "—"}
            </span>
            <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-700">{item.status}</span>
            {displaySentimentForItem(item) ? (
              <span
                className={`px-2 py-1 rounded-md capitalize ${
                  displaySentimentForItem(item) === "positive"
                    ? "bg-emerald-50 text-emerald-800"
                    : displaySentimentForItem(item) === "negative"
                      ? "bg-red-50 text-red-700"
                      : "bg-blue-50 text-blue-800"
                }`}
              >
                AI {displaySentimentForItem(item)}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Department</p>
              <p className="font-medium text-gray-800">
                {displayOptionalLabel(ticketDepartment(item) || item.department)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Service</p>
              <p className="font-medium text-gray-800">{ticketService(item) || "—"}</p>
            </div>
          </div>

          <section className="rounded-xl border-2 border-[#2A6FDB]/30 bg-gradient-to-r from-purple-50 to-blue-50 p-4">
            <h3 className="text-sm font-bold text-[#2A6FDB] uppercase tracking-wide mb-2">
              AI summary
            </h3>
            <p className="text-gray-800 leading-relaxed">{aiSummary}</p>
            {(item.aiUrgency || displayTopics.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.aiUrgency ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-white border capitalize">
                    Urgency: {item.aiUrgency}
                  </span>
                ) : null}
                {displayTopics.map((t) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-md bg-white/80 border text-gray-700">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {item.isSplitChild ? (
              <p className="text-xs text-gray-500 mt-2">
                This is one service ticket from a longer voice message. Speech-to-text below is the full
                voice session.
              </p>
            ) : null}
          </section>

          {isBot ? (
            <BotConversationFeedbackSection
              answers={botAnswers}
              combinedSessionUrl={item.voiceRecordingUrl}
              fullTranscript={item.comments}
              groupNote={
                item.isSplitChild
                  ? "Full bot conversation for this patient. This row is one service from that session."
                  : item.botVoiceSourceFeedbackId
                    ? "Voice Q&A from linked bot submission."
                    : null
              }
              compact
            />
          ) : (
            <>
              <section>
                <h3 className="text-sm font-bold text-[#2A6FDB] uppercase tracking-wide mb-2">
                  Speech-to-text
                  {displayMode === "voice" ? " (Sarvam)" : ""}
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {transcript || "—"}
                </p>
              </section>
              {hasVoice ? (
                <section>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2">
                    Voice audio (what patient spoke)
                  </h3>
                  <audio controls className="w-full max-w-xl" preload="metadata" src={voiceSrc!}>
                    Your browser does not support audio playback.
                  </audio>
                </section>
              ) : displayMode === "voice" ? (
                <p className="text-sm text-amber-700">No voice audio file on server.</p>
              ) : null}
            </>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
