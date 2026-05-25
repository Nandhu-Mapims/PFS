import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Heart } from "lucide-react";
import { getSession } from "../lib/auth";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";
import { FeedbackModeCards } from "./FeedbackModeCards";

/** Same patient feedback entry as Welcome — used when staff open Submit feedback after login. */
export function FeedbackMode() {
  const navigate = useNavigate();
  const session = getSession();
  const [primaryColor, setPrimaryColor] = useState("#2A6FDB");
  const [accentColor, setAccentColor] = useState("#2FBF71");

  useEffect(() => {
    void loadBrandingSettings().then((c) => {
      setPrimaryColor(c.primaryColor);
      setAccentColor(c.accentColor);
    });
    return onBrandingSettingsChange(() => {
      const c = getBrandingSettings();
      setPrimaryColor(c.primaryColor);
      setAccentColor(c.accentColor);
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 md:p-12 max-w-4xl w-full">
        <div className="mb-8">
          <div
            className="w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
            }}
          >
            <Heart className="w-16 h-16 text-white" fill="white" />
          </div>
          {session?.role === "staff" ? (
            <div className="text-sm text-gray-500 mb-2">Staff — patient feedback</div>
          ) : (
            <div className="text-sm text-gray-500 mb-2">Service Completed</div>
          )}
        </div>

        <h1 className="text-3xl md:text-4xl font-bold mb-3 text-gray-800">Thank you for visiting</h1>
        <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: primaryColor }}>
          MAPIMS Hospital
        </h2>

        <p className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed">
          Your feedback helps us improve care
        </p>

        <p className="text-sm font-semibold text-gray-700 mb-4">How would you like to share feedback?</p>

        <FeedbackModeCards primaryColor={primaryColor} />

        {session && (
          <button
            type="button"
            onClick={() => navigate("/welcome")}
            className="text-sm font-medium underline-offset-4 hover:underline"
            style={{ color: primaryColor }}
          >
            ← Patient welcome screen
          </button>
        )}
      </div>
    </div>
  );
}
