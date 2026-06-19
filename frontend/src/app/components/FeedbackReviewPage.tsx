import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { createBotFeedback } from "../lib/api";
import {
  enqueueFeedbackSubmission,
  notifyOutboxChanged,
  syncAfterEnqueue,
} from "../lib/feedbackOutbox";
import { getSession, isInternalUser } from "../lib/auth";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";
import {
  clearFeedbackReviewDraft,
  getFeedbackReviewDraft,
  patchFeedbackReviewRemark,
  type FeedbackReviewDraft,
} from "../lib/feedbackReviewStore";
import { patientRoutes } from "../lib/patientRoutes";
import { FeedbackSubmitOverview } from "./FeedbackSubmitOverview";

export function FeedbackReviewPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<FeedbackReviewDraft | null>(() => getFeedbackReviewDraft());
  const [remark, setRemark] = useState(() => getFeedbackReviewDraft()?.remark || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#2A6FDB");

  const session = getSession();
  const internalSubmit = isInternalUser(session);

  useEffect(() => {
    if (!getFeedbackReviewDraft()) {
      navigate(patientRoutes.mode, { replace: true });
      return;
    }
    setDraft(getFeedbackReviewDraft());
  }, [navigate]);

  useEffect(() => {
    void loadBrandingSettings().then((c) => setPrimaryColor(c.primaryColor));
    return onBrandingSettingsChange(() => {
      setPrimaryColor(getBrandingSettings().primaryColor);
    });
  }, []);

  useEffect(() => {
    patchFeedbackReviewRemark(remark);
  }, [remark]);

  const goBack = useCallback(() => {
    patchFeedbackReviewRemark(remark);
    if (draft?.kind === "standard") {
      const suffix = draft.inputKind === "voice" ? "?mode=voice" : "";
      navigate(`${patientRoutes.give}${suffix}`);
      return;
    }
    navigate(patientRoutes.bot);
  }, [draft, navigate]);

  const handleSubmit = useCallback(async () => {
    if (!draft) return;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (draft.kind === "standard") {
        const payload = {
          ...draft.payload,
          ...(remark.trim() ? { staffRemarks: remark.trim() } : {}),
        };

        await enqueueFeedbackSubmission({
          id: draft.outboxId,
          payload,
          audioBlob: draft.audioBlob,
          thankYouState: {
            rating: draft.rating,
            fromStaffSession: internalSubmit,
          },
        });

        const syncResult = await syncAfterEnqueue(draft.outboxId);
        notifyOutboxChanged();

        let voiceUploadWarning: string | undefined;
        let offlineQueued = false;
        let created: Record<string, unknown> = {};

        if (syncResult.kind === "queued") {
          offlineQueued = true;
        } else {
          created = syncResult.response;
          if (syncResult.kind === "text_only") {
            voiceUploadWarning =
              "Your feedback was saved. We could not finish sending everything — your words are on record.";
          }
        }

        clearFeedbackReviewDraft();
        navigate(patientRoutes.thankYou, {
          state: {
            rating: draft.rating,
            fromStaffSession: internalSubmit,
            staffRemarks: remark.trim() || undefined,
            aiSummary: typeof created.aiSummary === "string" ? created.aiSummary : undefined,
            aiSentiment: created.aiSentiment as "positive" | "neutral" | "negative" | undefined,
            aiUrgency: created.aiUrgency as string | undefined,
            aiTopics: Array.isArray(created.aiTopics) ? (created.aiTopics as string[]) : undefined,
            voiceUploadWarning,
            offlineQueued,
          },
        });
        return;
      }

      const created = await createBotFeedback({
        ...draft.identityFields,
        rating: 3,
        comments: draft.mergedComments,
        ...(remark.trim() ? { staffRemarks: remark.trim() } : {}),
        source: internalSubmit ? "staff" : "patient",
        submissionMode: "bot",
        conversationAnswers: draft.answers,
        answerAudioBlobs: draft.blobs,
      });

      clearFeedbackReviewDraft();
      navigate(patientRoutes.thankYou, {
        state: {
          fromStaffSession: internalSubmit,
          staffRemarks: remark.trim() || undefined,
          aiSummary: created.aiSummary || undefined,
          aiSentiment: created.aiSentiment || undefined,
          aiTopics: created.aiTopics || undefined,
        },
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [draft, internalSubmit, navigate, remark]);

  if (!draft) {
    return null;
  }

  if (draft.kind === "standard") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 border border-gray-100">
          <FeedbackSubmitOverview
            patientName={draft.payload.patientName}
            submissionLabel={draft.inputKind === "voice" ? "Voice feedback" : "Typed feedback"}
            remark={remark}
            onRemarkChange={setRemark}
            onSubmit={() => void handleSubmit()}
            onBack={goBack}
            isSubmitting={isSubmitting}
            submitError={submitError}
            primaryColor={primaryColor}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 border border-gray-100">
        <FeedbackSubmitOverview
          patientName={draft.identityFields.patientName}
          submissionLabel="Voice conversation"
          remark={remark}
          onRemarkChange={setRemark}
          onSubmit={() => void handleSubmit()}
          onBack={goBack}
          isSubmitting={isSubmitting}
          submitError={submitError}
          primaryColor={primaryColor}
        />
      </div>
    </div>
  );
}
