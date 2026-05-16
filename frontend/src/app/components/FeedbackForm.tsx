import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { createFeedback, lookupPatientRecords, type FeedbackPayload, type PatientLookupMatch } from "../lib/api";
import { getSession } from "../lib/auth";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";
import { FeedbackVoiceSection } from "./FeedbackVoiceSection";

type InputKind = "voice" | "type";
type IdentificationMode = "name" | "uhid";

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
  const [identificationMode, setIdentificationMode] = useState<IdentificationMode>("name");
  const [manualPatientName, setManualPatientName] = useState("");
  const [manualDepartment, setManualDepartment] = useState("");
  const [manualWard, setManualWard] = useState("");
  const [uhidInput, setUhidInput] = useState("");
  const [lookupFrmDate, setLookupFrmDate] = useState("");
  const [lookupToDate, setLookupToDate] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupMatches, setLookupMatches] = useState<PatientLookupMatch[]>([]);
  const [lookupRangeLabel, setLookupRangeLabel] = useState("");
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);

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
    setIdentificationMode("name");
    setManualPatientName("");
    setManualDepartment("");
    setManualWard("");
    setUhidInput("");
    setLookupFrmDate("");
    setLookupToDate("");
    setLookupMatches([]);
    setLookupRangeLabel("");
    setSelectedMatchKey(null);
    setLookupError(null);
  }, [modeParam]);

  const selectedEmotionData = emotions.find((e) => e.id === selectedEmotion);
  const primaryTint = `${primaryColor}1A`;
  const primarySoftBorder = `${primaryColor}66`;

  const selectedMatch =
    lookupMatches.find((m) => m.key === selectedMatchKey) ?? null;

  const nameReady =
    identificationMode === "name"
      ? Boolean(manualPatientName.trim())
      : Boolean(selectedMatch?.patientName.trim());

  useEffect(() => {
    if (identificationMode !== "uhid") return;
    if (lookupMatches.length === 1) {
      setSelectedMatchKey(lookupMatches[0].key);
    } else if (lookupMatches.length === 0) {
      setSelectedMatchKey(null);
    } else {
      setSelectedMatchKey((prev) => {
        if (prev && lookupMatches.some((m) => m.key === prev)) return prev;
        return null;
      });
    }
  }, [identificationMode, lookupMatches]);

  useEffect(() => {
    if (identificationMode === "name") {
      setUhidInput("");
      setLookupFrmDate("");
      setLookupToDate("");
      setLookupMatches([]);
      setLookupRangeLabel("");
      setSelectedMatchKey(null);
      setLookupError(null);
    }
  }, [identificationMode]);

  const runPatientLookup = async () => {
    const reg = uhidInput.trim();
    if (!reg) {
      setLookupError("Enter your hospital registration number (UHID) first.");
      return;
    }
    try {
      setLookupError(null);
      setLookupLoading(true);
      setLookupMatches([]);
      setSelectedMatchKey(null);
      const result = await lookupPatientRecords({
        regNo: reg,
        frmDate: lookupFrmDate.trim() || undefined,
        toDate: lookupToDate.trim() || undefined,
      });
      setLookupMatches(result.matches);
      setLookupRangeLabel(`${result.frmDate} – ${result.toDate}`);
      if (!result.matches.length) {
        setLookupError(
          "No OP/IP rows returned for this number in the selected period. Try a wider optional date range (MM/DD/YYYY), then tap Look up again."
        );
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed.");
      setLookupMatches([]);
    } finally {
      setLookupLoading(false);
    }
  };

  const onPickMatch = (m: PatientLookupMatch) => {
    setSelectedMatchKey(m.key);
  };

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
    if (identificationMode === "name") {
      if (!manualPatientName.trim()) {
        setSubmitError("Please enter your name.");
        return;
      }
    } else {
      const regTrim = uhidInput.trim();
      if (!regTrim) {
        setSubmitError("Enter your UHID and run Look up first.");
        return;
      }
      if (!selectedMatch || !selectedMatch.patientName.trim()) {
        setSubmitError(
          "Choose your visit from the EMR list after Look up — name and department come from hospital records only."
        );
        return;
      }
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

      if (identificationMode === "name") {
        const created = await createFeedback({
          patientName: manualPatientName.trim(),
          department: manualDepartment.trim() || undefined,
          ward: manualWard.trim() || undefined,
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
        return;
      }

      const regTrim = uhidInput.trim();
      const sel = selectedMatch;

      const emrPayload: Partial<
        Pick<
          FeedbackPayload,
          "patientRegNo" | "patientEncounterType" | "ward" | "ipNo" | "visitOrAdmissionDate"
        >
      > = {
        patientRegNo: regTrim,
        patientEncounterType: sel!.encounterType,
        ward: sel!.ward.trim() || undefined,
        ipNo: sel!.ipNo || undefined,
        visitOrAdmissionDate:
          sel!.encounterType === "ip"
            ? sel!.admissionDate || undefined
            : sel!.visitDate || undefined,
      };

      const created = await createFeedback({
        patientName: sel!.patientName.trim(),
        department: sel!.department.trim() || undefined,
        rating: selectedEmotion as number,
        comments: comments.trim(),
        source: isStaffSession ? "staff" : "patient",
        ...emrPayload,
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

  const identityReady =
    identificationMode === "name"
      ? Boolean(manualPatientName.trim())
      : Boolean(selectedMatch?.patientName.trim());

  const canSubmitType = Boolean(selectedEmotion && identityReady);
  const canSubmitVoice = Boolean(voiceReady && selectedEmotion != null && identityReady);

  const submitEnabled =
    identityReady &&
    !isSubmitting &&
    (inputKind === "type" ? canSubmitType : canSubmitVoice);

  const readonlyBox =
    "w-full min-h-[56px] p-4 text-lg border-2 border-gray-200 rounded-2xl bg-gray-50 text-gray-800";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-8">
          How was your experience today?
        </h2>

        <div className="mb-8">
          <p className="text-sm font-semibold text-gray-700 mb-3 text-center md:text-left">
            How should we identify you?
          </p>
          <div className="flex flex-wrap justify-center md:justify-start gap-2">
            <button
              type="button"
              onClick={() => setIdentificationMode("name")}
              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                identificationMode === "name"
                  ? "text-white shadow-md"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
              style={
                identificationMode === "name"
                  ? { backgroundColor: primaryColor, borderColor: primaryColor }
                  : undefined
              }
            >
              Name only
            </button>
            <button
              type="button"
              onClick={() => setIdentificationMode("uhid")}
              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                identificationMode === "uhid"
                  ? "text-white shadow-md"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
              style={
                identificationMode === "uhid"
                  ? { backgroundColor: primaryColor, borderColor: primaryColor }
                  : undefined
              }
            >
              UHID / EMR look up
            </button>
          </div>
        </div>

        {identificationMode === "name" ? (
          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-gray-700 leading-relaxed">
            Enter your details below. Use this if you do not have your registration number or cannot use EMR look up.
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-gray-700 leading-relaxed">
            Name, department, and ward are loaded only from{" "}
            <span className="font-semibold text-gray-900">hospital EMR</span> after you enter your registration number
            and tap <span className="font-semibold">Look up</span>. They cannot be typed here.
          </div>
        )}

        {identificationMode === "uhid" && (
          <div className="mb-8 space-y-4 rounded-2xl border-2 border-gray-200 p-4 md:p-5 bg-gray-50/80">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={uhidInput}
                onChange={(e) => setUhidInput(e.target.value)}
                placeholder="Hospital registration no. (UHID)"
                className="flex-1 p-4 text-lg border-2 border-gray-300 rounded-2xl outline-none transition-all bg-white"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                  e.currentTarget.style.boxShadow = `0 0 0 4px ${primaryColor}33`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => void runPatientLookup()}
                disabled={lookupLoading}
                className="sm:w-44 py-4 rounded-2xl font-bold text-white shadow-md disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {lookupLoading ? "Searching…" : "Look up"}
              </button>
            </div>
            <details className="text-sm text-gray-600">
            <summary className="cursor-pointer font-semibold text-gray-700">
              Optional date range (usually MM/DD/YYYY — match hospital SQL)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <input
                type="text"
                value={lookupFrmDate}
                onChange={(e) => setLookupFrmDate(e.target.value)}
                placeholder="From — MM/DD/YYYY"
                className="p-3 border-2 border-gray-300 rounded-xl bg-white outline-none"
              />
              <input
                type="text"
                value={lookupToDate}
                onChange={(e) => setLookupToDate(e.target.value)}
                placeholder="To — MM/DD/YYYY"
                className="p-3 border-2 border-gray-300 rounded-xl bg-white outline-none"
              />
            </div>
            <p className="text-xs mt-2">
              Leave both blank to search the default window on the server (typically the last several weeks through today).
            </p>
          </details>

          {lookupRangeLabel ? (
            <p className="text-xs text-gray-500">
              Query range sent to EMR: <span className="font-mono">{lookupRangeLabel}</span>
            </p>
          ) : null}

          {lookupMatches.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">Select your visit (from EMR)</p>
              <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {lookupMatches.map((m) => (
                  <li key={m.key}>
                    <button
                      type="button"
                      onClick={() => onPickMatch(m)}
                      className={`w-full text-left rounded-xl border-2 p-3 transition-all text-sm ${
                        selectedMatchKey === m.key ? "shadow-md" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                      style={
                        selectedMatchKey === m.key
                          ? { borderColor: primaryColor, backgroundColor: primaryTint }
                          : undefined
                      }
                    >
                      <span className="font-bold text-gray-900 uppercase">{m.encounterType}</span>
                      <span className="text-gray-500"> · </span>
                      <span className="text-gray-800">{m.patientName || "—"}</span>
                      <span className="text-gray-500"> · </span>
                      <span className="text-gray-800">{m.department || "Dept —"}</span>
                      {m.ward ? (
                        <>
                          <span className="text-gray-500"> · Ward </span>
                          <span className="text-gray-800">{m.ward}</span>
                        </>
                      ) : null}
                      <div className="text-xs text-gray-600 mt-1">
                        {m.encounterType === "ip"
                          ? m.admissionDate
                            ? `Admitted ${m.admissionDate}`
                            : "Inpatient"
                          : m.visitDate
                            ? `Visit ${m.visitDate}`
                            : "Outpatient"}
                        {m.ipNo ? ` · IP ${m.ipNo}` : ""}
                        {m.tokenNo ? ` · Token ${m.tokenNo}` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lookupMatches.length === 1 && selectedMatch && (
            <p className="text-sm text-gray-700 rounded-xl border border-gray-200 bg-white p-3">
              <span className="font-semibold">Matched from EMR: </span>
              <span className="uppercase font-bold">{selectedMatch.encounterType}</span>
              {selectedMatch.patientName ? (
                <>
                  {" "}
                  · <span>{selectedMatch.patientName}</span>
                </>
              ) : null}
              {selectedMatch.department ? (
                <>
                  {" "}
                  · <span>{selectedMatch.department}</span>
                </>
              ) : null}
              {selectedMatch.ward ? (
                <>
                  {" "}
                  · Ward <span>{selectedMatch.ward}</span>
                </>
              ) : null}
            </p>
          )}

          {lookupError ? <p className="text-sm text-amber-800 font-medium">{lookupError}</p> : null}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {identificationMode === "name" ? (
            <>
              <input
                type="text"
                value={manualPatientName}
                onChange={(e) => setManualPatientName(e.target.value)}
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
                value={manualDepartment}
                onChange={(e) => setManualDepartment(e.target.value)}
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
              <input
                type="text"
                value={manualWard}
                onChange={(e) => setManualWard(e.target.value)}
                placeholder="Ward (optional)"
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
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Name (EMR)</p>
                <div className={readonlyBox}>{selectedMatch?.patientName?.trim() || "—"}</div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Department (EMR)</p>
                <div className={readonlyBox}>{selectedMatch?.department?.trim() || "—"}</div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ward (EMR)</p>
                <div className={readonlyBox}>{selectedMatch?.ward?.trim() || "—"}</div>
              </div>
            </>
          )}
        </div>

        <p
          className={`mb-8 border rounded-lg p-3 ${inputKind === "voice" ? "text-base font-medium text-gray-800 text-center" : "text-sm text-gray-600"}`}
          style={{ backgroundColor: primaryTint, borderColor: primarySoftBorder }}
        >
          {inputKind === "voice" ? (
            identificationMode === "name" ? (
              "Please enter your name before recording."
            ) : (
              "Look up your registration number and confirm your visit from EMR before recording."
            )
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
