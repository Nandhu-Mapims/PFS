import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Mic, Keyboard } from "lucide-react";
import { getSession } from "../lib/auth";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";
import { mixWithBlack, mixWithWhite, hexWithAlpha } from "../lib/brandColor";

const spotlightModes = [
  {
    id: "voice",
    icon: Mic,
    label: "Voice feedback",
    path: "/feedback/give?mode=voice",
  },
  {
    id: "type",
    icon: Keyboard,
    label: "Ratings & comments",
    path: "/feedback/give",
  },
] as const;

export function FeedbackMode() {
  const navigate = useNavigate();
  const session = getSession();

  const [primaryColor, setPrimaryColor] = useState("#2A6FDB");

  useEffect(() => {
    void loadBrandingSettings().then((c) => {
      setPrimaryColor(c.primaryColor);
    });
    return onBrandingSettingsChange(() => {
      setPrimaryColor(getBrandingSettings().primaryColor);
    });
  }, []);

  const heroGradient = {
    backgroundImage: `linear-gradient(155deg, ${primaryColor} 0%, ${mixWithBlack(primaryColor, 0.42)} 55%, ${mixWithBlack(primaryColor, 0.58)} 100%)`,
  };
  const halo = hexWithAlpha(primaryColor, 0.22);

  return (
    <div className="max-w-xl md:max-w-2xl mx-auto">
      <div className="relative mb-10">
        <div
          className="overflow-hidden rounded-3xl px-7 pt-10 pb-[5.75rem] md:pt-12 md:pb-[6.5rem] text-center text-white shadow-xl"
          style={heroGradient}
        >
          <h2 className="text-[1.625rem] md:text-4xl font-bold tracking-tight mb-2 drop-shadow-sm">
            How would you like to share feedback?
          </h2>
          <p className="text-sm md:text-base text-white/90 max-w-md mx-auto leading-relaxed px-2">
            Tap an option below
          </p>
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 left-1/2 h-52 w-[130%] -translate-x-1/2 rounded-full blur-3xl"
            style={{ backgroundColor: halo }}
          />
        </div>

        <div className="relative z-[1] px-5 -mt-14 md:-mt-16 mx-auto">
          <div className="rounded-[1.625rem] bg-white shadow-2xl border border-gray-100/90 p-6 md:p-8">
            <div className="grid grid-cols-2 gap-4 md:gap-6">
              {spotlightModes.map((mode) => {
                const Icon = mode.icon;
                const isVoice = mode.id === "voice";
                const circleBg = isVoice
                  ? `linear-gradient(145deg, ${mixWithWhite(primaryColor, 0.12)} 0%, ${mixWithBlack(primaryColor, 0.18)} 100%)`
                  : `linear-gradient(145deg, ${mixWithWhite(primaryColor, 0.35)} 0%, ${mixWithBlack(primaryColor, 0.08)} 100%)`;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => navigate(mode.path)}
                    className="group flex flex-col items-center rounded-2xl border-2 border-gray-100 bg-[#fafbfc] p-6 md:p-8 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:border-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--primary)]"
                  >
                    <div
                      className="mb-5 flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-full shadow-inner md:h-[5.75rem] md:w-[5.75rem]"
                      style={{ backgroundImage: circleBg }}
                    >
                      <Icon className="text-white md:scale-110" size={40} strokeWidth={2} />
                    </div>
                    <span className="text-center text-sm md:text-[0.95rem] font-bold leading-snug text-gray-800 px-1">
                      {mode.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {session && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => navigate("/welcome")}
            className="text-lg font-medium underline-offset-4 hover:underline"
            style={{ color: primaryColor }}
          >
            ← Patient welcome screen
          </button>
        </div>
      )}
    </div>
  );
}
