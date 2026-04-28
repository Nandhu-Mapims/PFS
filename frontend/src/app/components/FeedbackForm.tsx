import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { createFeedback } from "../lib/api";
import { getSession } from "../lib/auth";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";

const emotions = [
  { id: 5, emoji: '😍', label: 'Excellent', prompt: 'What did you love about your visit?' },
  { id: 4, emoji: '😃', label: 'Good', prompt: 'What did you like?' },
  { id: 3, emoji: '😐', label: 'Okay', prompt: 'How can we improve?' },
  { id: 2, emoji: '😟', label: 'Poor', prompt: 'What went wrong?' },
  { id: 1, emoji: '😡', label: 'Very Poor', prompt: 'What went wrong?' },
];

export function FeedbackForm() {
  const navigate = useNavigate();
  const [selectedEmotion, setSelectedEmotion] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [department, setDepartment] = useState("");
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#2A6FDB");

  const selectedEmotionData = emotions.find(e => e.id === selectedEmotion);
  const primaryTint = `${primaryColor}1A`;
  const primarySoftBorder = `${primaryColor}66`;

  useEffect(() => {
    void loadBrandingSettings().then((current) => {
      setPrimaryColor(current.primaryColor);
    });
    return onBrandingSettingsChange(() => {
      setPrimaryColor(getBrandingSettings().primaryColor);
    });
  }, []);

  const handleSubmit = async () => {
    if (!selectedEmotion || !patientName.trim()) {
      setSubmitError("Please fill your name and rating.");
      return;
    }

    try {
      setSubmitError(null);
      setIsSubmitting(true);
      const isStaffSession = getSession()?.role === "staff";
      const created = await createFeedback({
        patientName: patientName.trim(),
        department: department.trim() || undefined,
        rating: selectedEmotion,
        comments: comments.trim(),
        source: isStaffSession ? "staff" : "patient",
      });
      navigate("/thank-you", {
        state: {
          rating: selectedEmotion,
          fromStaffSession: isStaffSession,
          ticketRaised: Boolean(created.ticketRaised),
          ticketId: created.ticketId || null,
          aiSummary: created.aiSummary || undefined,
          aiSentiment: created.aiSentiment || undefined,
          aiUrgency: created.aiUrgency || undefined,
          aiTopics: created.aiTopics || undefined,
        },
      });
    } catch (error) {
      setSubmitError("Could not submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10">
        {/* Question */}
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-10">
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
          className="text-sm text-gray-600 mb-8 border rounded-lg p-3"
          style={{ backgroundColor: primaryTint, borderColor: primarySoftBorder }}
        >
          If the patient is elder or unable to read/write, staff can fill this form on
          their behalf.
        </p>

        {/* Emotion Scale */}
        <div className="grid grid-cols-5 gap-2 md:gap-4 mb-8">
          {emotions.map((emotion) => (
            <button
              key={emotion.id}
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
              <span className={`text-[11px] md:text-sm text-center leading-tight font-semibold ${
                selectedEmotion === emotion.id ? "text-white" : "text-gray-700"
              }`}>
                {emotion.label}
              </span>
            </button>
          ))}
        </div>

        {/* Dynamic Prompt */}
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

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!selectedEmotion || !patientName.trim() || isSubmitting}
          className={`w-full text-2xl md:text-3xl py-6 md:py-8 rounded-2xl font-bold shadow-lg transition-all duration-200 ${
            selectedEmotion && patientName.trim() && !isSubmitting
              ? "text-white hover:shadow-xl hover:scale-[1.02]"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
          style={
            selectedEmotion && patientName.trim() && !isSubmitting
              ? { backgroundColor: primaryColor }
              : undefined
          }
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
              Submitting...
            </span>
          ) : (
            'Submit Feedback'
          )}
        </button>
        {submitError && (
          <p className="mt-4 text-red-600 text-center font-medium">{submitError}</p>
        )}

      </div>

      {/* Speed Indicator */}
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500">
          ⚡ Takes less than 20 seconds
        </p>
      </div>
    </div>
  );
}
