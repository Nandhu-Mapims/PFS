import { useNavigate, useLocation } from "react-router";
import { Check, Home } from "lucide-react";
import { useEffect } from "react";
import { getSession } from "../lib/auth";

export function ThankYou() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromStaffSession = Boolean(location.state?.fromStaffSession);
  const aiSentiment = location.state?.aiSentiment as
    | "positive"
    | "neutral"
    | "negative"
    | null
    | undefined;
  const aiSummary = typeof location.state?.aiSummary === "string" ? location.state.aiSummary : "";
  const aiTopics = Array.isArray(location.state?.aiTopics)
    ? (location.state.aiTopics as string[])
    : [];
  const session = getSession();
  const isStaffSession = fromStaffSession || session?.role === "staff";

  const showGoogleReviewsPrompt = aiSentiment !== "negative";

  useEffect(() => {
    // Could trigger confetti animation here for positive feedback
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12 max-w-2xl w-full">
        {/* Success Icon */}
        <div className="mb-8">
          <div className="w-28 h-28 md:w-32 md:h-32 mx-auto rounded-full flex items-center justify-center animate-in zoom-in duration-500 bg-[#2FBF71] shadow-inner">
            <Check size={56} strokeWidth={4} className="text-white" />
          </div>
        </div>

        {/* Success Message */}
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
          Your feedback has been received
        </h2>

        {/* Reassurance Text */}
        <p className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed">
          Thank you for helping us improve our care
        </p>

        {aiSummary.trim() && (
          <div className="mb-8 rounded-2xl border border-purple-200 bg-purple-50/80 px-5 py-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 mb-2">
              Quick insight (AI summary)
            </p>
            <p className="text-base text-gray-800 leading-relaxed">{aiSummary.trim()}</p>
            {aiTopics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {aiTopics.slice(0, 5).map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-white px-2 py-1 text-xs text-gray-700 shadow-sm border border-purple-100"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Trust Building Message */}
        {showGoogleReviewsPrompt && (
          <div className="bg-gradient-to-r from-[#2A6FDB] bg-opacity-5 to-[#2FBF71] bg-opacity-5 rounded-2xl p-6 mb-8 border border-[#2FBF71] border-opacity-30">
            <p className="text-base md:text-lg text-gray-700 leading-relaxed">
              We're glad you had a positive experience! Would you consider sharing your feedback on Google Reviews?
            </p>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={() => navigate("/feedback")}
          className="w-full bg-[#2A6FDB] text-white text-xl md:text-2xl py-5 md:py-6 rounded-2xl font-bold shadow-lg hover:bg-[#1e5bbd] hover:shadow-xl hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-3"
        >
          <Home size={28} />
          {isStaffSession ? "Next Patient Feedback" : "Next Feedback"}
        </button>
      </div>

      {/* Immediate Acknowledgement Note */}
      <p className="mt-6 text-sm text-gray-500">
        ✓ Instant acknowledgement • No delays
      </p>
    </div>
  );
}
