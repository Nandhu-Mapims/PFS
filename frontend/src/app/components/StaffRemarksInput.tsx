import { useState } from "react";
import { FeedbackVoiceSection } from "./FeedbackVoiceSection";

type StaffRemarksMode = "type" | "voice";

interface StaffRemarksInputProps {
  value: string;
  onChange: (value: string) => void;
  primaryColor: string;
  username: string;
  roleLabel?: string;
}

export function StaffRemarksInput({
  value,
  onChange,
  primaryColor,
  username,
  roleLabel,
}: StaffRemarksInputProps) {
  const [mode, setMode] = useState<StaffRemarksMode>("type");
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const switchMode = (next: StaffRemarksMode) => {
    if (next === mode) return;
    setMode(next);
    setVoiceError(null);
    if (next === "voice") {
      setVoiceRevision((r) => r + 1);
    }
  };

  const modeButtonClass = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold transition-colors ${
      active ? "bg-amber-100 text-amber-900" : "bg-white text-gray-600 hover:bg-amber-50"
    }`;

  return (
    <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
      <p className="text-sm font-semibold text-amber-900 mb-1">
        Staff submission — filled on behalf of patient
      </p>
      <p className="text-xs text-amber-800 mb-3">
        Logged in as {username}
        {roleLabel ? ` (${roleLabel})` : ""}.
      </p>
      <label className="block text-sm font-medium text-gray-800 mb-1">Staff remarks (optional)</label>
      <p className="text-xs text-amber-800 mb-3">
        Type or speak a note — it will be combined with the patient feedback transcript for AI
        analysis.
      </p>

      <div className="flex rounded-lg border border-amber-200 overflow-hidden mb-3 w-fit">
        <button type="button" onClick={() => switchMode("type")} className={modeButtonClass(mode === "type")}>
          Type
        </button>
        <button
          type="button"
          onClick={() => switchMode("voice")}
          className={modeButtonClass(mode === "voice")}
        >
          Voice
        </button>
      </div>

      {mode === "type" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Patient unable to type; collected at nursing station…"
          className="w-full h-24 p-3 text-sm border border-amber-200 rounded-lg outline-none resize-none bg-white"
        />
      ) : (
        <FeedbackVoiceSection
          variant="staffRemarks"
          nameReady
          primaryColor={primaryColor}
          resetRevision={voiceRevision}
          skipRatingInference
          maxRecordingSecondsOverride={90}
          onVoiceSuccess={(transcript) => {
            onChange(transcript);
            setVoiceError(null);
          }}
          onVoiceCleared={() => onChange("")}
          onVoiceError={setVoiceError}
        />
      )}

      {voiceError && mode === "voice" ? (
        <p className="mt-2 text-sm text-red-600 text-center">{voiceError}</p>
      ) : null}
    </div>
  );
}
