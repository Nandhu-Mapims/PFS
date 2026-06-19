import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Check, Loader } from "lucide-react";
import {
  coerceTranscriptText,
  inferVoiceRatingFromTranscript,
  type SpeechLanguageCode,
} from "../lib/api";
import { transcribeVoiceRecordingChunked } from "../lib/audioTranscription";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";

type RecordingState = "idle" | "recording" | "processing" | "completed";

/** Sarvam REST works best ~30s per clip — auto-rotate recorder and merge transcripts for longer speech */
const SEGMENT_MS = 22000;

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pickRecorderMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

function mergeSegments(map: Map<number, string>): string {
  const keys = [...map.keys()].sort((a, b) => a - b);
  return keys
    .map((k) => map.get(k) ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface FeedbackVoiceSectionProps {
  nameReady: boolean;
  primaryColor: string;
  resetRevision: number;
  onVoiceSuccess: (transcript: string, inferredRating: number) => void;
  onVoiceCleared: () => void;
  onVoiceError: (message: string | null) => void;
  /** Full-session recording blob for server upload (parallel to segmented transcription). */
  onVoiceRecordingReady?: (blob: Blob | null) => void;
  /** Compact UI for staff remark capture (no patient rating needed). */
  variant?: "default" | "staffRemarks";
  /** Skip OpenRouter rating inference (staff notes only need transcript). */
  skipRatingInference?: boolean;
  maxRecordingSecondsOverride?: number;
}

export function FeedbackVoiceSection({
  nameReady,
  primaryColor,
  resetRevision,
  onVoiceSuccess,
  onVoiceCleared,
  onVoiceError,
  onVoiceRecordingReady,
  variant = "default",
  skipRatingInference = false,
  maxRecordingSecondsOverride,
}: FeedbackVoiceSectionProps) {
  const isStaffRemarks = variant === "staffRemarks";
  const [speechLanguageCode, setSpeechLanguageCode] =
    useState<SpeechLanguageCode>("unknown");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [localTranscript, setLocalTranscript] = useState("");
  /** Shown during recording — how many parts have finished uploading (not guaranteed order) */
  const [segmentsDoneUi, setSegmentsDoneUi] = useState(0);
  const [maxRecordingSeconds, setMaxRecordingSeconds] = useState(120);
  const [secondsRemaining, setSecondsRemaining] = useState(120);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const segmentTimerRef = useRef(0);
  const countdownIntervalRef = useRef(0);
  const finishRecordingPipelineRef = useRef<() => void>(() => {});

  /** Monotonic segment index assigned when a clip is closed */
  const nextSegmentIdxRef = useRef(0);
  const transcriptsBySegmentRef = useRef(new Map<number, string>());
  const transcriptionJobsRef = useRef<Promise<void>[]>([]);

  const rotateBusyRef = useRef(false);
  const finishingSessionRef = useRef(false);
  const recordingStateRef = useRef<RecordingState>("idle");

  /** One continuous recorder for archiving the whole session (segmented recorder still used for STT). */
  const archiveRecorderRef = useRef<MediaRecorder | null>(null);
  const archiveChunksRef = useRef<BlobPart[]>([]);
  const archiveMimeRef = useRef<string>("audio/webm");

  const onVoiceRecordingReadyRef = useRef(onVoiceRecordingReady);
  const onVoiceErrorRef = useRef(onVoiceError);
  onVoiceRecordingReadyRef.current = onVoiceRecordingReady;
  onVoiceErrorRef.current = onVoiceError;

  const [liveTranscript, setLiveTranscript] = useState("");

  const stopArchiveRecorderAsync = useCallback(
    async (notify: boolean) => {
      const ar = archiveRecorderRef.current;
      if (!ar || ar.state === "inactive") {
        archiveRecorderRef.current = null;
        archiveChunksRef.current = [];
        if (notify) onVoiceRecordingReady?.(null);
        return;
      }
      await new Promise<void>((resolve) => {
        ar.onstop = () => {
          try {
            if (notify) {
              const blob = new Blob(archiveChunksRef.current, {
                type: ar.mimeType || archiveMimeRef.current,
              });
              onVoiceRecordingReady?.(blob.size > 0 ? blob : null);
            }
          } catch {
            if (notify) onVoiceRecordingReady?.(null);
          }
          archiveChunksRef.current = [];
          archiveRecorderRef.current = null;
          resolve();
        };
        try {
          ar.stop();
        } catch {
          if (notify) onVoiceRecordingReady?.(null);
          archiveChunksRef.current = [];
          archiveRecorderRef.current = null;
          resolve();
        }
      });
    },
    [onVoiceRecordingReady]
  );

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    void loadBrandingSettings().then((b) => {
      const seconds = maxRecordingSecondsOverride ?? b.voiceRecordingMaxSeconds;
      setMaxRecordingSeconds(seconds);
      setSecondsRemaining(seconds);
    });
    return onBrandingSettingsChange(() => {
      const b = getBrandingSettings();
      const seconds = maxRecordingSecondsOverride ?? b.voiceRecordingMaxSeconds;
      setMaxRecordingSeconds(seconds);
      if (recordingStateRef.current !== "recording") {
        setSecondsRemaining(seconds);
      }
    });
  }, [maxRecordingSecondsOverride]);

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = 0;
    }
  }, []);

  const clearCountdownTimer = useCallback(() => {
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = 0;
    }
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdownTimer();
    setSecondsRemaining(maxRecordingSeconds);
    countdownIntervalRef.current = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearCountdownTimer();
          window.setTimeout(() => {
            void finishRecordingPipelineRef.current();
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearCountdownTimer, maxRecordingSeconds]);

  function scheduleSegmentRotate() {
    clearSegmentTimer();
    segmentTimerRef.current = window.setTimeout(() => {
      void rotateSegmentAutomatically();
    }, SEGMENT_MS);
  }

  const enqueueTranscription = useCallback(async (segmentIdx: number, blob: Blob) => {
    if (!blob.size) {
      transcriptsBySegmentRef.current.set(segmentIdx, "");
      return;
    }
    const ext =
      blob.type.includes("mp4") || blob.type.includes("m4a")
        ? "m4a"
        : blob.type.includes("webm")
          ? "webm"
          : "audio";
    const filename = `seg-${segmentIdx}.${ext}`;
    const { transcript: raw } = await transcribeVoiceRecordingChunked(
      blob,
      filename,
      speechLanguageCode
    );
    const t = coerceTranscriptText(raw).trim();
    transcriptsBySegmentRef.current.set(segmentIdx, t);
    setSegmentsDoneUi((n) => n + 1);
    setLiveTranscript(mergeSegments(transcriptsBySegmentRef.current));
  }, [speechLanguageCode]);

  const attachRecorderCallbacks = useCallback((recorder: MediaRecorder) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      clearSegmentTimer();
      onVoiceError("Voice capture failed.");
      setRecordingState("idle");
      stopTracks();
      mediaRecorderRef.current = null;
    };
  }, [clearSegmentTimer, onVoiceError, stopTracks]);

  const createAndStartRecorder = useCallback(
    (stream: MediaStream) => {
      const mimeType = pickRecorderMime();
      mimeRef.current = mimeType || "audio/webm";
      chunksRef.current = [];
      try {
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        attachRecorderCallbacks(recorder);
        recorder.start(250);
      } catch {
        stopTracks();
        onVoiceError("This browser cannot capture voice for upload.");
        setRecordingState("idle");
      }
    },
    [attachRecorderCallbacks, onVoiceError, stopTracks]
  );

  /** Stops active recorder → blob → enqueue transcribe → optionally start next recorder */
  const finalizeCurrentSegment = useCallback(
    async (stopFully: boolean) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        if (stopFully) {
          await stopArchiveRecorderAsync(true);
          stopTracks();
        }
        return;
      }

      clearSegmentTimer();

      const segmentIdx = nextSegmentIdxRef.current;
      nextSegmentIdxRef.current += 1;

      const done = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          try {
            const blob = new Blob(chunksRef.current, {
              type: recorder.mimeType || mimeRef.current,
            });
            resolve(blob);
          } catch (e) {
            reject(e instanceof Error ? e : new Error("Blob error"));
          }
        };
        recorder.onerror = () => reject(new Error("Recorder error"));
        try {
          recorder.stop();
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Stop failed"));
        }
      });

      mediaRecorderRef.current = null;

      let blob: Blob;
      try {
        blob = await done;
      } catch {
        blob = new Blob([]);
      }

      transcriptionJobsRef.current.push(enqueueTranscription(segmentIdx, blob));

      if (!stopFully) {
        const stream = streamRef.current;
        if (stream?.active && recordingStateRef.current === "recording") {
          createAndStartRecorder(stream);
          scheduleSegmentRotate();
        }
      } else {
        await stopArchiveRecorderAsync(true);
        stopTracks();
      }
    },
    [
      clearSegmentTimer,
      createAndStartRecorder,
      enqueueTranscription,
      stopArchiveRecorderAsync,
      stopTracks,
    ]
  );

  const rotateSegmentAutomatically = useCallback(async () => {
    if (finishingSessionRef.current || recordingStateRef.current !== "recording") return;
    if (rotateBusyRef.current) {
      segmentTimerRef.current = window.setTimeout(() => {
        void rotateSegmentAutomatically();
      }, 450);
      return;
    }
    rotateBusyRef.current = true;
    try {
      await finalizeCurrentSegment(false);
    } finally {
      rotateBusyRef.current = false;
    }
  }, [finalizeCurrentSegment]);

  useEffect(() => {
    return () => {
      clearCountdownTimer();
      clearSegmentTimer();
      mediaRecorderRef.current?.stop();
      try {
        if (archiveRecorderRef.current && archiveRecorderRef.current.state !== "inactive") {
          archiveRecorderRef.current.stop();
        }
      } catch {
        /* noop */
      }
      archiveRecorderRef.current = null;
      archiveChunksRef.current = [];
      stopTracks();
    };
  }, [clearCountdownTimer, clearSegmentTimer, stopTracks]);

  useEffect(() => {
    clearCountdownTimer();
    clearSegmentTimer();
    mediaRecorderRef.current?.stop();
    stopTracks();
    mediaRecorderRef.current = null;
    setRecordingState("idle");
    setLocalTranscript("");
    setLiveTranscript("");
    setSegmentsDoneUi(0);
    nextSegmentIdxRef.current = 0;
    transcriptsBySegmentRef.current.clear();
    transcriptionJobsRef.current = [];
    finishingSessionRef.current = false;
    onVoiceErrorRef.current(null);
    onVoiceRecordingReadyRef.current?.(null);
  }, [resetRevision, stopTracks, clearCountdownTimer, clearSegmentTimer]);

  const finishRecordingPipeline = useCallback(async () => {
    if (finishingSessionRef.current) return;
    for (let i = 0; i < 50 && rotateBusyRef.current; i += 1) {
      await new Promise((r) => setTimeout(r, 60));
    }

    finishingSessionRef.current = true;
    setRecordingState("processing");

    clearCountdownTimer();
    clearSegmentTimer();
    rotateBusyRef.current = true;
    try {
      await finalizeCurrentSegment(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Could not finish voice capture.";
      onVoiceError(msg);
      await stopArchiveRecorderAsync(false);
      stopTracks();
      setRecordingState("idle");
      finishingSessionRef.current = false;
      return;
    } finally {
      rotateBusyRef.current = false;
    }

    try {
      await Promise.all(transcriptionJobsRef.current);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Transcription failed.";
      onVoiceError(msg);
      setRecordingState("idle");
      finishingSessionRef.current = false;
      return;
    }

    const merged = mergeSegments(transcriptsBySegmentRef.current);
    const cleaned = merged.trim() ? merged.trim() : "(No speech detected.)";
    setLocalTranscript(cleaned);

    let rating = 3;
    if (!skipRatingInference) {
      try {
        const inferred = await inferVoiceRatingFromTranscript(cleaned);
        if (Number.isFinite(inferred.rating)) {
          rating = Math.min(5, Math.max(1, Math.round(inferred.rating)));
        }
      } catch {
        rating = 3;
      }
    }

    onVoiceSuccess(cleaned, rating);
    onVoiceError(null);
    setRecordingState("completed");
    setSegmentsDoneUi(0);
    finishingSessionRef.current = false;
  }, [finalizeCurrentSegment, clearCountdownTimer, clearSegmentTimer, onVoiceError, onVoiceSuccess, skipRatingInference, stopArchiveRecorderAsync, stopTracks]);

  finishRecordingPipelineRef.current = () => {
    void finishRecordingPipeline();
  };

  const startRecording = async () => {
    if (!nameReady) {
      onVoiceError("Please enter your name to speak.");
      return;
    }

    onVoiceError(null);
    onVoiceCleared();
    onVoiceRecordingReadyRef.current?.(null);
    setLocalTranscript("");
    setLiveTranscript("");
    nextSegmentIdxRef.current = 0;
    transcriptsBySegmentRef.current.clear();
    transcriptionJobsRef.current = [];
    setSegmentsDoneUi(0);
    finishingSessionRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onVoiceError("Microphone access was denied. Allow the mic and try again.");
      return;
    }

    streamRef.current = stream;

    archiveChunksRef.current = [];
    const arcMime = pickRecorderMime();
    archiveMimeRef.current = arcMime || "audio/webm";
    try {
      const arcRec = arcMime ? new MediaRecorder(stream, { mimeType: arcMime }) : new MediaRecorder(stream);
      archiveRecorderRef.current = arcRec;
      arcRec.ondataavailable = (e) => {
        if (e.data.size > 0) archiveChunksRef.current.push(e.data);
      };
      arcRec.start(250);
    } catch {
      archiveRecorderRef.current = null;
    }

    createAndStartRecorder(stream);
    if (!mediaRecorderRef.current) {
      await stopArchiveRecorderAsync(false);
      stopTracks();
      onVoiceError("This browser cannot capture voice for upload.");
      return;
    }

    setRecordingState("recording");
    recordingStateRef.current = "recording";
    startCountdown();
    scheduleSegmentRotate();
  };

  const toggleRecording = () => {
    if (recordingState === "idle" || recordingState === "completed") {
      void startRecording();
      return;
    }
    if (recordingState === "recording") {
      void finishRecordingPipeline();
    }
  };

  const nameMissing = !nameReady;
  const micDisabled =
    recordingState === "processing" || (recordingState === "recording" ? false : nameMissing);

  const micIsPrimary = recordingState === "idle" && !nameMissing;

  const recordAgain = () => {
    clearCountdownTimer();
    clearSegmentTimer();
    setSecondsRemaining(maxRecordingSeconds);
    setRecordingState("idle");
    setLocalTranscript("");
    setLiveTranscript("");
    setSegmentsDoneUi(0);
    onVoiceCleared();
    onVoiceError(null);
    onVoiceRecordingReadyRef.current?.(null);
    nextSegmentIdxRef.current = 0;
    transcriptsBySegmentRef.current.clear();
    transcriptionJobsRef.current = [];
    finishingSessionRef.current = false;
  };

  const displayTranscript =
    localTranscript.trim() ||
    liveTranscript.trim() ||
    (recordingState === "processing" ? "Understanding your feedback…" : "");

  const showTranscriptPanel =
    recordingState === "processing" ||
    recordingState === "completed" ||
    (recordingState === "recording" && Boolean(liveTranscript.trim()));

  return (
    <div className={isStaffRemarks ? "mb-2" : "mb-8"}>
      <div className={`flex flex-col items-center ${isStaffRemarks ? "gap-4 mb-4" : "gap-8 mb-8"}`}>
        <div className="w-full max-w-sm">
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            Speech language
          </label>
          <select
            value={speechLanguageCode}
            onChange={(e) => setSpeechLanguageCode(e.target.value as SpeechLanguageCode)}
            disabled={recordingState === "recording" || recordingState === "processing"}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          >
            <option value="unknown">Auto detect</option>
            <option value="en-IN">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="ta-IN">Tamil</option>
            <option value="te-IN">Telugu</option>
            <option value="kn-IN">Kannada</option>
          </select>
        </div>

        <div className="text-center min-h-[56px]">
          <p className={`font-bold text-gray-800 mb-1 ${isStaffRemarks ? "text-base" : "text-xl md:text-2xl"}`}>
            {recordingState === "idle" && (isStaffRemarks ? "Tap to record staff note" : "We're ready to listen")}
            {recordingState === "recording" && (isStaffRemarks ? "Recording staff note…" : "We're listening…")}
            {recordingState === "processing" && "One moment…"}
            {recordingState === "completed" && "Done"}
          </p>
          {recordingState === "idle" && !nameMissing && (
            <p className="text-sm text-gray-500 mt-1">
              Up to {formatCountdown(maxRecordingSeconds)} to speak
            </p>
          )}
          {recordingState === "recording" && (
            <>
              <p className="text-sm text-gray-600">
                Take your time — tap <span className="font-semibold text-gray-800">Done</span> when you
                finish speaking.
              </p>
              {segmentsDoneUi > 0 && liveTranscript.trim() && (
                <p className="mt-3 text-sm text-gray-700 leading-relaxed px-2">
                  {liveTranscript.trim()}
                </p>
              )}
              {segmentsDoneUi > 0 && !liveTranscript.trim() && (
                <p className="mt-2 text-xs font-medium" style={{ color: primaryColor }}>
                  {segmentsDoneUi} part{segmentsDoneUi === 1 ? "" : "s"} sent for transcription…
                </p>
              )}
            </>
          )}
        </div>

        {recordingState === "recording" && (
          <>
            <div
              className="flex items-end justify-center gap-1 h-16 w-full max-w-xs"
              aria-hidden
            >
              {Array.from({ length: 24 }, (_, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full animate-pulse"
                  style={{
                    backgroundColor: primaryColor,
                    height: `${10 + (i % 5) * 8}px`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
            <div className="w-full max-w-sm space-y-2 text-center">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
                role="progressbar"
                aria-valuenow={secondsRemaining}
                aria-valuemin={0}
                aria-valuemax={maxRecordingSeconds}
                aria-label="Listening time available"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                  style={{
                    width: `${Math.max(0, (secondsRemaining / maxRecordingSeconds) * 100)}%`,
                    backgroundColor: primaryColor,
                  }}
                />
              </div>
              <p className="text-xs text-gray-400">
                Up to {formatCountdown(maxRecordingSeconds)} per visit
              </p>
            </div>
          </>
        )}

        <div className="w-full max-w-md">
          {recordingState === "processing" ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5 text-gray-600">
              <Loader size={28} className="animate-spin shrink-0" />
              <span className="text-base font-medium">
                {isStaffRemarks ? "Transcribing staff note…" : "Understanding your feedback…"}
              </span>
            </div>
          ) : recordingState === "recording" ? (
            <button
              type="button"
              onClick={toggleRecording}
              className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-bold text-white shadow-lg transition-all hover:opacity-95 active:scale-[0.99]"
              style={{ backgroundColor: primaryColor }}
            >
              <Check size={22} strokeWidth={2.5} />
              Done speaking
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={micDisabled || recordingState === "completed"}
              title={nameMissing ? "Please enter your name to speak" : undefined}
              className={`w-full flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg md:text-xl font-bold shadow-lg transition-all ${
                micDisabled || recordingState === "completed"
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "text-white hover:opacity-95 active:scale-[0.99]"
              }`}
              style={micIsPrimary ? { backgroundColor: primaryColor } : undefined}
            >
              <AudioLines size={isStaffRemarks ? 22 : 28} strokeWidth={2} />
              {recordingState === "completed"
                ? isStaffRemarks
                  ? "Note recorded"
                  : "Feedback received"
                : isStaffRemarks
                  ? "Record staff note"
                  : "Share your experience"}
            </button>
          )}
        </div>
      </div>

      {(displayTranscript || recordingState === "completed" || recordingState === "processing") && (
        <div className="animate-in fade-in slide-in-from-bottom duration-300">
          <p className="text-sm font-semibold text-gray-600 mb-2">
            {isStaffRemarks ? "Staff remark transcript" : "What we heard"}
          </p>
          <div className="bg-[#F5F7FA] rounded-2xl p-5 md:p-6 border-2 border-gray-200 min-h-[100px] mb-4">
            <p className="text-base md:text-lg text-gray-700 leading-relaxed">{displayTranscript}</p>
          </div>
          {recordingState === "completed" && (
            <p className="text-center">
              <button
                type="button"
                onClick={recordAgain}
                className="font-medium hover:underline text-base"
                style={{ color: primaryColor }}
              >
                Speak again
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
