import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { createFeedback } from "../lib/api";
import { getSession } from "../lib/auth";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";
import { FeedbackVoiceSection } from "./FeedbackVoiceSection";

type InputKind = "voice" | "type";

const emotions = [
  { id: 5, emoji: "😍", label: "Excellent", prompt: "What did you love about your visit?" },
  { id: 4, emoji: "😃", label: "Good", prompt: "What did you like?" },
  { id: 3, emoji: "😐", label: "Okay", prompt: "How can we improve?" },
  { id: 2, emoji: "😟", label: "Poor", prompt: "What went wrong?" },
  { id: 1, emoji: "😡", label: "Very Poor", prompt: "What went wrong?" },
];

export function FeedbackForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const modeParam = searchParams.get("mode");
  const inputKind: InputKind = modeParam === "voice" ? "voice" : "type";

  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceRecordingBlob, setVoiceRecordingBlob] = useState<Blob | null>(null);
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [department, setDepartment] = useState("");
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#2A6FDB");
  const prevModeBucketRef = useRef<string | null>(null);

  useEffect(() => {
    const bucket = modeParam === "voice" ? "voice" : "type";
    if (prevModeBucketRef.current === null) {
      prevModeBucketRef.current = bucket;
      return;
    }
    if (prevModeBucketRef.current === bucket) return;
    prevModeBucketRef.current = bucket;
    setSubmitError(null);
    setSelectedEmotion(null);
    setComments("");
    setVoiceReady(false);
    setVoiceRecordingBlob(null);
    setVoiceRevision((r) => r + 1);
  }, [modeParam]);

  const selectedEmotionData = emotions.find((e) => e.id === selectedEmotion);
  const primaryTint = `${primaryColor}1A`;
  const primarySoftBorder = `${primaryColor}66`;
  const nameReady = Boolean(patientName.trim());

  useEffect(() => {
    void loadBrandingSettings().then((current) => {
      setPrimaryColor(current.primaryColor);
    });
    return onBrandingSettingsChange(() => {
      setPrimaryColor(getBrandingSettings().primaryColor);
    });
  }, []);

  const onVoiceSuccess = useCallback((transcript: string, inferredRating: number) => {
    setComments(transcript);
    setSelectedEmotion(inferredRating);
    setVoiceReady(true);
    setSubmitError(null);
  }, []);

  const onVoiceCleared = useCallback(() => {
    setVoiceReady(false);
    setSelectedEmotion(null);
    setComments("");
  }, []);

  const onVoiceError = useCallback((message: string | null) => {
    setSubmitError(message);
  }, []);

  const onVoiceRecordingReady = useCallback((blob: Blob | null) => {
    setVoiceRecordingBlob(blob);
  }, []);

  const handleSubmit = async () => {
    if (!patientName.trim()) {
      setSubmitError("Please enter your name.");
      return;
    }

    if (inputKind === "type") {
      if (!selectedEmotion) {
        setSubmitError("Please choose how your experience felt.");
        return;
      }
    } else {
      if (!voiceReady || selectedEmotion == null) {
        setSubmitError("Record your voice feedback first.");
        return;
      }
      if (!voiceRecordingBlob || voiceRecordingBlob.size === 0) {
        setSubmitError("Voice recording was not captured. Tap record again.");
        return;
      }
      const c = comments.trim();
      if (!c || c === "(No speech detected.)") {
        setSubmitError("No speech detected — tap Record again and speak.");
        return;
      }
    }

    try {
      setSubmitError(null);
      setIsSubmitting(true);
      const isStaffSession = getSession()?.role === "staff";
      const created = await createFeedback({
        patientName: patientName.trim(),
        department: department.trim() || undefined,
        rating: selectedEmotion as number,
        comments: comments.trim(),
        source: isStaffSession ? "staff" : "patient",
        voiceRecording:
          inputKind === "voice" && voiceRecordingBlob && voiceRecordingBlob.size > 0
            ? voiceRecordingBlob
            : undefined,
      });
      navigate("/thank-you", {
        state: {
          rating: selectedEmotion,
          fromStaffSession: isStaffSession,
          aiSummary: created.aiSummary || undefined,
          aiSentiment: created.aiSentiment || undefined,
          aiUrgency: created.aiUrgency || undefined,
          aiTopics: created.aiTopics || undefined,
        },
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmitType = Boolean(selectedEmotion && patientName.trim());
  const canSubmitVoice = Boolean(voiceReady && selectedEmotion != null && patientName.trim());

  const submitEnabled =
    patientName.trim() &&
    !isSubmitting &&
    (inputKind === "type" ? canSubmitType : canSubmitVoice);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-8">
          How was your experience today?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <input
            type="text"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Your name"
            className="w-full p-4 text-lg border-2 border-gray-300 rounded-2xl outline-none transition-all"
            onFocus={(e) => {
              e.currentTarget.style.borderColor = primaryColor;
              e.currentTarget.style.boxShadow = `0 0 0 4px ${primaryColor}33`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Department (optional)"
            className="w-full p-4 text-lg border-2 border-gray-300 rounded-2xl outline-none transition-all"
            onFocus={(e) => {
              e.currentTarget.style.borderColor = primaryColor;
              e.currentTarget.style.boxShadow = `0 0 0 4px ${primaryColor}33`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        <p
          className={`mb-8 border rounded-lg p-3 ${inputKind === "voice" ? "text-base font-medium text-gray-800 text-center" : "text-sm text-gray-600"}`}
          style={{ backgroundColor: primaryTint, borderColor: primarySoftBorder }}
        >
          {inputKind === "voice" ? (
            "Please enter your name to speak."
          ) : (
            <>
              If the patient is elder or unable to read/write, staff can fill this form on their behalf. Prefer
              to speak?{" "}
              <button
                type="button"
                onClick={() => navigate("/feedback/give?mode=voice", { replace: true })}
                className="font-semibold underline underline-offset-2"
                style={{ color: primaryColor }}
              >
                Use voice instead
              </button>{" "}
              (Tamil & English). Or{" "}
              <button
                type="button"
                onClick={() => navigate("/feedback")}
                className="font-semibold underline underline-offset-2"
                style={{ color: primaryColor }}
              >
                pick again on the previous screen
              </button>
              .
            </>
          )}
        </p>

        {inputKind === "voice" && (
          <FeedbackVoiceSection
            nameReady={nameReady}
            primaryColor={primaryColor}
            resetRevision={voiceRevision}
            onVoiceSuccess={onVoiceSuccess}
            onVoiceCleared={onVoiceCleared}
            onVoiceError={onVoiceError}
            onVoiceRecordingReady={onVoiceRecordingReady}
          />
        )}

        {inputKind === "type" && (
          <>
            <p className="text-sm text-gray-600 text-center mb-5 max-w-lg mx-auto leading-relaxed">
              Choose how you felt, then{" "}
              <span className="font-semibold text-gray-800">
                describe your visit in comments so your rating matches your words.
              </span>
            </p>
            <div className="grid grid-cols-5 gap-2 md:gap-4 mb-8">
              {emotions.map((emotion) => (
                <button
                  key={emotion.id}
                  type="button"
                  onClick={() => setSelectedEmotion(emotion.id)}
                  className={`flex min-h-[106px] md:min-h-[132px] flex-col items-center justify-center gap-2 px-2 py-3 md:p-5 rounded-2xl border-2 transition-all duration-200 ${
                    selectedEmotion === emotion.id
                      ? "scale-105 shadow-xl text-white"
                      : "bg-white border-gray-300 hover:scale-105"
                  }`}
                  style={
                    selectedEmotion === emotion.id
                      ? { backgroundColor: primaryColor, borderColor: primaryColor }
                      : { borderColor: "#D1D5DB" }
                  }
                >
                  <span className="text-4xl md:text-5xl leading-none">{emotion.emoji}</span>
                  <span
                    className={`text-[11px] md:text-sm text-center leading-tight font-semibold ${
                      selectedEmotion === emotion.id ? "text-white" : "text-gray-700"
                    }`}
                  >
                    {emotion.label}
                  </span>
                </button>
              ))}
            </div>

            {selectedEmotionData && (
              <div className="mb-6 animate-in fade-in slide-in-from-top duration-300">
                <label className="block text-xl md:text-2xl font-semibold text-gray-800 mb-4">
                  {selectedEmotionData.prompt}
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Share your thoughts... (optional)"
                  className="w-full h-32 md:h-40 p-4 md:p-5 text-lg border-2 border-gray-300 rounded-2xl outline-none resize-none transition-all"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 4px ${primaryColor}33`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!submitEnabled}
          className={`w-full text-2xl md:text-3xl py-6 md:py-8 rounded-2xl font-bold shadow-lg transition-all duration-200 ${
            submitEnabled ? "text-white hover:shadow-xl hover:scale-[1.02]" : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
          style={submitEnabled ? { backgroundColor: primaryColor } : undefined}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-3">
              <span className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin inline-block" />
              Submitting...
            </span>
          ) : (
            "Submit Feedback"
          )}
        </button>
        {submitError && <p className="mt-4 text-red-600 text-center font-medium">{submitError}</p>}
      </div>

      <div className="mt-6 text-center space-y-3">
        <p className="text-sm text-gray-500">⚡ Takes less than 20 seconds</p>
        <button
          type="button"
          onClick={() => navigate("/feedback")}
          className="hover:underline font-medium text-base"
          style={{ color: primaryColor }}
        >
          ← Choose a different feedback method
        </button>
      </div>
    </div>
  );
}
