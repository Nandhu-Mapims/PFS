import { useEffect, useState } from "react";
import { Bot, Heart, Keyboard, Mic, Palette } from "lucide-react";
import feedbackLogo from "./image/feedback_logo.png";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
  resetBrandingSettings,
  saveBrandingSettings,
} from "../lib/branding";

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const validHex = /^#[0-9A-Fa-f]{6}$/.test(value);
  const swatchHex = validHex ? value : "#cccccc";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-3 shadow-sm">
      <label className="relative block w-full h-16 rounded-lg overflow-hidden cursor-pointer ring-1 ring-gray-200 group">
        <span
          className="absolute inset-0 block transition-opacity group-hover:opacity-90"
          style={{ backgroundColor: swatchHex }}
          aria-hidden
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
        <span className="absolute bottom-2 left-2 text-xs font-semibold text-white drop-shadow-md">
          Click to pick
        </span>
        <input
          type="color"
          value={validHex ? swatchHex : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
          aria-label={`Pick ${label}`}
        />
      </label>

      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="#2A6FDB"
        className={`w-full font-mono text-sm px-3 py-2 border rounded-lg outline-none uppercase tracking-wide ${
          validHex ? "border-gray-300 focus:border-[#2A6FDB] focus:ring-2 focus:ring-[#2A6FDB]/20" : "border-amber-400 bg-amber-50"
        }`}
        spellCheck={false}
      />
    </div>
  );
}

export function AdminSettingsPage() {
  const [brandPrimary, setBrandPrimary] = useState("#2A6FDB");
  const [brandAccent, setBrandAccent] = useState("#2FBF71");
  const [brandPageBg, setBrandPageBg] = useState("#F5F7FA");
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState<string | null>(null);
  const [voiceMaxSeconds, setVoiceMaxSeconds] = useState(120);
  const [botThinkSeconds, setBotThinkSeconds] = useState(3);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadBrandingSettings().then((next) => {
      if (!alive) return;
      setBrandPrimary(next.primaryColor);
      setBrandAccent(next.accentColor);
      setBrandPageBg(next.pageBackgroundColor);
      setBrandLogoDataUrl(next.logoDataUrl);
      setVoiceMaxSeconds(next.voiceRecordingMaxSeconds);
      setBotThinkSeconds(next.botThinkSeconds);
    });
    const unsubscribe = onBrandingSettingsChange(() => {
      const updated = getBrandingSettings();
      setBrandPrimary(updated.primaryColor);
      setBrandAccent(updated.accentColor);
      setBrandPageBg(updated.pageBackgroundColor);
      setBrandLogoDataUrl(updated.logoDataUrl);
      setVoiceMaxSeconds(updated.voiceRecordingMaxSeconds);
      setBotThinkSeconds(updated.botThinkSeconds);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  async function saveBranding() {
    if (!/^#[0-9A-Fa-f]{6}$/.test(brandPrimary) || !/^#[0-9A-Fa-f]{6}$/.test(brandAccent) || !/^#[0-9A-Fa-f]{6}$/.test(brandPageBg)) {
      setBannerMessage("Use valid hex colors like #2A6FDB for all theme fields.");
      return;
    }
    try {
      setIsSaving(true);
      setBannerMessage(null);
      const secs = Number(voiceMaxSeconds);
      if (!Number.isFinite(secs) || secs < 15 || secs > 600) {
        setBannerMessage("Voice time limit must be between 15 and 600 seconds.");
        return;
      }
      const think = Number(botThinkSeconds);
      if (!Number.isFinite(think) || think < 1 || think > 30) {
        setBannerMessage("Bot think time must be between 1 and 30 seconds.");
        return;
      }
      await saveBrandingSettings({
        primaryColor: brandPrimary,
        accentColor: brandAccent,
        pageBackgroundColor: brandPageBg,
        logoDataUrl: brandLogoDataUrl,
        voiceRecordingMaxSeconds: Math.round(secs),
        botThinkSeconds: Math.round(think),
      });
      setBannerMessage("Settings saved. Patient screens update immediately.");
    } catch {
      setBannerMessage("Failed to save theme. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please upload an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo size must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : null;
      setBrandLogoDataUrl(value);
      setLogoError(null);
    };
    reader.onerror = () => {
      setLogoError("Unable to read logo file.");
    };
    reader.readAsDataURL(file);
  }

  function clearCustomLogo() {
    setBrandLogoDataUrl(null);
    setLogoError(null);
  }

  async function restoreDefaultBranding() {
    try {
      setIsSaving(true);
      const defaults = await resetBrandingSettings();
      setBrandPrimary(defaults.primaryColor);
      setBrandAccent(defaults.accentColor);
      setBrandPageBg(defaults.pageBackgroundColor);
      setBrandLogoDataUrl(defaults.logoDataUrl);
      setVoiceMaxSeconds(defaults.voiceRecordingMaxSeconds);
      setBotThinkSeconds(defaults.botThinkSeconds);
      setLogoError(null);
      setBannerMessage("Settings reset to defaults.");
    } catch {
      setBannerMessage("Failed to reset theme. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const previewLogo = brandLogoDataUrl || feedbackLogo;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-white shrink-0"
            style={{ backgroundColor: brandPrimary }}
          >
            <Palette size={24} />
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">Settings</h2>
            <p className="text-base text-gray-600 mt-1 max-w-2xl">
              Color theme, voice recording limit, and hospital logo for patient screens.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={restoreDefaultBranding}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={() => void saveBranding()}
            disabled={isSaving}
            className="px-5 py-2 rounded-lg text-white text-sm font-semibold shadow-md"
            style={{ backgroundColor: brandPrimary }}
          >
            {isSaving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-xl shadow-md p-5 md:p-6 space-y-5 min-w-0">
          {bannerMessage ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {bannerMessage}
            </p>
          ) : null}

          <div className="rounded-lg border border-gray-200 p-4 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Color theme</h3>
              <p className="text-sm text-gray-600 mt-1">
                Primary color for headings and buttons. Accent is the gradient on the welcome heart.
                Page background is behind the white feedback card.
              </p>
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColorField
              label="Primary color"
              hint="Headings, links, mode icons"
              value={brandPrimary}
              onChange={setBrandPrimary}
            />
            <ColorField
              label="Accent color"
              hint="Welcome heart gradient"
              value={brandAccent}
              onChange={setBrandAccent}
            />
            <ColorField
              label="Page background"
              hint="Behind feedback card"
              value={brandPageBg}
              onChange={setBrandPageBg}
            />
          </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Voice feedback</h3>
              <p className="text-sm font-semibold text-gray-800 mt-2">Recording time limit</p>
              <p className="text-xs text-gray-500 mt-1">
                Maximum recording duration on the voice feedback screen. Patients see a countdown
                while listening.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={15}
                max={600}
                step={5}
                value={voiceMaxSeconds}
                onChange={(e) => setVoiceMaxSeconds(Number(e.target.value))}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-lg font-semibold tabular-nums"
              />
              <span className="text-sm text-gray-600">seconds (15–600)</span>
            </div>
            <p className="text-xs text-gray-500">
              Default: 120 seconds (2 minutes). Recording stops automatically at 0:00.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Bot className="w-5 h-5 text-[#2A6FDB]" />
                AI Voice Guide (bot conversation)
              </h3>
              <p className="text-sm font-semibold text-gray-800 mt-2">Think time before each answer</p>
              <p className="text-xs text-gray-500 mt-1">
                After each question plays, patients see “சிறிது நேரம் யோசியுங்கள்…” with a countdown
                before the microphone opens.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={1}
                max={30}
                step={1}
                value={botThinkSeconds}
                onChange={(e) => setBotThinkSeconds(Number(e.target.value))}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-lg font-semibold tabular-nums"
              />
              <span className="text-sm text-gray-600">seconds (1–30)</span>
            </div>
            <p className="text-xs text-gray-500">Default: 3 seconds.</p>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Hospital logo</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <img
                src={previewLogo}
                alt="App logo preview"
                className="h-14 w-auto max-w-[200px] object-contain bg-white border border-gray-200 rounded-md px-2 py-1"
              />
              <div className="flex flex-wrap gap-2">
                <label className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-white cursor-pointer">
                  Upload logo
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                <button
                  type="button"
                  onClick={clearCustomLogo}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-white"
                >
                  Use default logo
                </button>
              </div>
            </div>
            {logoError ? <p className="text-sm text-red-600 mt-2">{logoError}</p> : null}
            <p className="text-xs text-gray-500 mt-2">PNG or JPG up to 2MB. Shown in header and QR poster.</p>
          </div>

        </div>

        <div className="bg-white rounded-xl shadow-md p-5 md:p-6 lg:sticky lg:top-6 min-w-0">
          <h3 className="text-lg font-semibold text-gray-800 mb-1">Live preview</h3>
          <p className="text-sm text-gray-600 mb-4">Patient welcome screen (approximate)</p>

          <div
            className="rounded-2xl p-6 md:p-8 flex items-center justify-center w-full"
            style={{ backgroundColor: brandPageBg }}
          >
            <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8 w-full max-w-lg mx-auto text-center">
              <div
                className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%)`,
                }}
              >
                <Heart className="w-10 h-10 text-white" fill="white" />
              </div>
              <p className="text-xs text-gray-500 mb-2">Service Completed</p>
              <p className="text-lg font-bold text-gray-800 mb-1">Thank you for visiting</p>
              <p className="text-xl font-bold mb-3" style={{ color: brandPrimary }}>
                MAPIMS Hospital
              </p>
              <p className="text-sm text-gray-600 mb-4">Your feedback helps us improve care</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Bot, title: "AI Voice Guide", subtitle: "Tamil Q&A" },
                  { icon: Mic, title: "Voice feedback", subtitle: "Speak freely" },
                  { icon: Keyboard, title: "Rate & share", subtitle: "Stars + comments" },
                ].map(({ icon: Icon, title, subtitle }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-gray-200 p-2 flex flex-col items-center justify-center gap-0.5 min-h-[4.5rem]"
                    style={{ backgroundColor: brandPageBg }}
                  >
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: brandPrimary }}
                    >
                      <Icon size={16} />
                    </div>
                    <span className="text-[9px] font-bold text-gray-800 leading-tight text-center">
                      {title}
                    </span>
                    <span className="text-[8px] font-medium text-gray-500 leading-tight text-center">
                      {subtitle}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
