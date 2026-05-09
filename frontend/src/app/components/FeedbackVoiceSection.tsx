import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader } from "lucide-react";
import {
  coerceTranscriptText,
  inferVoiceRatingFromTranscript,
  transcribeVoiceRecording,
} from "../lib/api";

type RecordingState = "idle" | "recording" | "processing" | "completed";

/** Sarvam REST works best ~30s per clip — auto-rotate recorder and merge transcripts for longer speech */
const SEGMENT_MS = 26000;

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
}

export function FeedbackVoiceSection({
  nameReady,
  primaryColor,
  resetRevision,
  onVoiceSuccess,
  onVoiceCleared,
  onVoiceError,
}: FeedbackVoiceSectionProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [localTranscript, setLocalTranscript] = useState("");
  /** Shown during recording — how many parts have finished uploading (not guaranteed order) */
  const [segmentsDoneUi, setSegmentsDoneUi] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const segmentTimerRef = useRef(0);

  /** Monotonic segment index assigned when a clip is closed */
  const nextSegmentIdxRef = useRef(0);
  const transcriptsBySegmentRef = useRef(new Map<number, string>());
  const transcriptionJobsRef = useRef<Promise<void>[]>([]);

  const rotateBusyRef = useRef(false);
  const finishingSessionRef = useRef(false);
  const recordingStateRef = useRef<RecordingState>("idle");

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = 0;
    }
  }, []);

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
    const { transcript: raw } = await transcribeVoiceRecording(blob, filename);
    const t = coerceTranscriptText(raw).trim();
    transcriptsBySegmentRef.current.set(segmentIdx, t);
    setSegmentsDoneUi((n) => n + 1);
  }, []);

  const attachRecorderCallbacks = useCallback((recorder: MediaRecorder) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      clearSegmentTimer();
      onVoiceError("Recording failed.");
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
        onVoiceError("This browser cannot record audio for upload.");
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
        if (stopFully) stopTracks();
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
        stopTracks();
      }
    },
    [clearSegmentTimer, createAndStartRecorder, enqueueTranscription, stopTracks]
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
      clearSegmentTimer();
      mediaRecorderRef.current?.stop();
      stopTracks();
    };
  }, [clearSegmentTimer, stopTracks]);

  useEffect(() => {
    clearSegmentTimer();
    mediaRecorderRef.current?.stop();
    stopTracks();
    mediaRecorderRef.current = null;
    setRecordingState("idle");
    setLocalTranscript("");
    setSegmentsDoneUi(0);
    nextSegmentIdxRef.current = 0;
    transcriptsBySegmentRef.current.clear();
    transcriptionJobsRef.current = [];
    finishingSessionRef.current = false;
    onVoiceError(null);
  }, [resetRevision, stopTracks, onVoiceError, clearSegmentTimer]);

  const finishRecordingPipeline = useCallback(async () => {
    for (let i = 0; i < 50 && rotateBusyRef.current; i += 1) {
      await new Promise((r) => setTimeout(r, 60));
    }

    finishingSessionRef.current = true;
    setRecordingState("processing");

    clearSegmentTimer();
    rotateBusyRef.current = true;
    try {
      await finalizeCurrentSegment(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Recording finalize failed.";
      onVoiceError(msg);
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
    try {
      const inferred = await inferVoiceRatingFromTranscript(cleaned);
      if (Number.isFinite(inferred.rating)) {
        rating = Math.min(5, Math.max(1, Math.round(inferred.rating)));
      }
    } catch {
      rating = 3;
    }

    onVoiceSuccess(cleaned, rating);
    onVoiceError(null);
    setRecordingState("completed");
    setSegmentsDoneUi(0);
    finishingSessionRef.current = false;
  }, [finalizeCurrentSegment, clearSegmentTimer, onVoiceError, onVoiceSuccess]);

  const startRecording = async () => {
    if (!nameReady) {
      onVoiceError("Please enter your name to speak.");
      return;
    }

    onVoiceError(null);
    onVoiceCleared();
    setLocalTranscript("");
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

    createAndStartRecorder(stream);
    if (!mediaRecorderRef.current) return;

    setRecordingState("recording");
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
    clearSegmentTimer();
    setRecordingState("idle");
    setLocalTranscript("");
    setSegmentsDoneUi(0);
    onVoiceCleared();
    onVoiceError(null);
    nextSegmentIdxRef.current = 0;
    transcriptsBySegmentRef.current.clear();
    transcriptionJobsRef.current = [];
    finishingSessionRef.current = false;
  };

  return (
    <div className="mb-8">
      <div className="flex flex-col items-center gap-8 mb-8">
        <div className="text-center min-h-[56px]">
          <p className="text-xl md:text-2xl font-bold text-gray-800 mb-1">
            {recordingState === "idle" && "Tap to speak"}
            {recordingState === "recording" && "Listening…"}
            {recordingState === "processing" && "Transcribing & rating…"}
            {recordingState === "completed" && "Recording complete"}
          </p>
          {recordingState === "recording" && (
            <>
              <p className="text-sm text-gray-600">Tap stop when finished</p>
              <p className="mt-2 text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                Long replies are captured in segments (about{" "}
                {Math.round(SEGMENT_MS / 1000)}&nbsp;s each), transcribed, then merged into one text.
              </p>
              {segmentsDoneUi > 0 && (
                <p className="mt-2 text-xs font-medium" style={{ color: primaryColor }}>
                  {segmentsDoneUi} segment{segmentsDoneUi === 1 ? "" : "s"} sent for transcription…
                </p>
              )}
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={micDisabled || recordingState === "completed"}
            title={nameMissing ? "Please enter your name to speak" : undefined}
            className={`relative w-36 h-36 md:w-44 md:h-44 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
              recordingState === "recording"
                ? "bg-[#E5533D] hover:bg-[#d43e29]"
                : recordingState === "processing"
                  ? "bg-gray-400 cursor-not-allowed"
                  : recordingState === "completed"
                    ? "bg-gray-300 cursor-not-allowed"
                    : micDisabled
                      ? "bg-gray-300 cursor-not-allowed"
                      : "hover:scale-105"
            }`}
            style={micIsPrimary ? { backgroundColor: primaryColor } : undefined}
          >
            {recordingState === "processing" ? (
              <Loader size={56} className="text-white animate-spin" />
            ) : recordingState === "recording" ? (
              <Square size={56} className="text-white" fill="white" />
            ) : (
              <Mic size={56} className="text-white" strokeWidth={2} />
            )}

            {recordingState === "recording" && (
              <>
                <div className="absolute inset-0 rounded-full border-4 border-[#E5533D] animate-ping opacity-75" />
                <div className="absolute inset-0 rounded-full border-4 border-[#E5533D] animate-pulse" />
              </>
            )}
          </button>
        </div>

        {recordingState === "recording" && (
          <div className="flex items-end justify-center gap-1 h-16">
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
        )}
      </div>

      {(localTranscript || recordingState === "completed") && (
        <div className="animate-in fade-in slide-in-from-bottom duration-300">
          <p className="text-sm font-semibold text-gray-600 mb-2">What we heard</p>
          <div className="bg-[#F5F7FA] rounded-2xl p-5 md:p-6 border-2 border-gray-200 min-h-[100px] mb-4">
            <p className="text-base md:text-lg text-gray-700 leading-relaxed">{localTranscript}</p>
          </div>
          {recordingState === "completed" && (
            <p className="text-center">
              <button
                type="button"
                onClick={recordAgain}
                className="font-medium hover:underline text-base"
                style={{ color: primaryColor }}
              >
                Record again
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
