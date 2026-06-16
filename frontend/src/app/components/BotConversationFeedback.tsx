import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Loader, Mic, Volume2 } from "lucide-react";
import {
  coerceTranscriptText,
  createBotFeedback,
  getBotConversationConfig,
  resolveUploadUrl,
  type BotConversationAnswer,
  type BotConversationConfig,
  type BotConversationQuestion,
  transcribeVoiceRecording,
} from "../lib/api";
import { getSession } from "../lib/auth";
import { usePatientIdentity } from "../lib/usePatientIdentity";
import { PatientIdentitySection } from "./PatientIdentitySection";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";

const DEFAULT_BOT_THINK_SECONDS = 3;
const MAX_RECORD_MS = 45000;
const SILENCE_MS = 2200;
const MIN_RECORD_MS = 900;
const SILENCE_RMS_THRESHOLD = 7;

type Phase = "loading" | "identity" | "intro" | "question" | "submitting" | "submit-failed";
type QuestionPhase = "prompt" | "think" | "record" | "processing";

function questionAudioUrl(q: BotConversationQuestion | null): string | null {
  if (!q) return null;
  return resolveUploadUrl(q.audioUrl || q.videoUrl);
}

async function playAudioFile(el: HTMLAudioElement, src: string): Promise<void> {
  el.pause();
  el.currentTime = 0;
  el.src = src;
  el.load();
  await el.play();
}

function pickRecorderMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

export function BotConversationFeedback() {
  const navigate = useNavigate();
  const [primaryColor, setPrimaryColor] = useState("#2A6FDB");
  const [config, setConfig] = useState<BotConversationConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const identity = usePatientIdentity();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionPhase, setQuestionPhase] = useState<QuestionPhase>("prompt");
  const [thinkSeconds, setThinkSeconds] = useState(DEFAULT_BOT_THINK_SECONDS);
  const [skipIntro, setSkipIntro] = useState(false);
  const [skipThinkCountdown, setSkipThinkCountdown] = useState(false);
  const [thinkCountdown, setThinkCountdown] = useState(DEFAULT_BOT_THINK_SECONDS);
  const [answers, setAnswers] = useState<BotConversationAnswer[]>([]);
  const [answerBlobs, setAnswerBlobs] = useState<Blob[]>([]);
  const [pendingSubmit, setPendingSubmit] = useState<{
    answers: BotConversationAnswer[];
    blobs: Blob[];
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [isPlayingPrompt, setIsPlayingPrompt] = useState(false);

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef(0);
  const thinkTimerRef = useRef(0);
  const silenceIntervalRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const finishingRef = useRef(false);
  const beginThinkCountdownRef = useRef<() => void>(() => {});

  const sortedQuestions: BotConversationQuestion[] = config
    ? [...config.questions].sort((a, b) => a.order - b.order)
    : [];
  const currentQuestion = sortedQuestions[questionIndex] ?? null;
  const introAudioSrc = resolveUploadUrl(config?.introAudioUrl || config?.introVideoUrl);
  const primaryTint = `${primaryColor}1A`;
  const primarySoftBorder = `${primaryColor}66`;

  useEffect(() => {
    void loadBrandingSettings().then((c) => {
      setPrimaryColor(c.primaryColor);
      setThinkSeconds(c.botThinkSeconds);
      setSkipIntro(c.botSkipIntro);
      setSkipThinkCountdown(c.botSkipThinkCountdown);
    });
    return onBrandingSettingsChange(() => {
      const b = getBrandingSettings();
      setPrimaryColor(b.primaryColor);
      setThinkSeconds(b.botThinkSeconds);
      setSkipIntro(b.botSkipIntro);
      setSkipThinkCountdown(b.botSkipThinkCountdown);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    void getBotConversationConfig()
      .then((cfg) => {
        if (!alive) return;
        setConfig(cfg);
        setPhase("identity");
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : "Could not load questions");
        setPhase("identity");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "identity" || !identity.identityReady) return;
    setSubmitError((prev) => {
      if (!prev) return prev;
      if (
        prev.startsWith("Please enter") ||
        prev.startsWith("Enter your UHID") ||
        prev.startsWith("Choose your visit")
      ) {
        return null;
      }
      return prev;
    });
  }, [phase, identity.identityReady, identity.nameReady]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (recordTimerRef.current) {
      window.clearTimeout(recordTimerRef.current);
      recordTimerRef.current = 0;
    }
    if (thinkTimerRef.current) {
      window.clearInterval(thinkTimerRef.current);
      thinkTimerRef.current = 0;
    }
    if (silenceIntervalRef.current) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = 0;
    }
  }, []);

  const stopSilenceMonitor = useCallback(() => {
    if (silenceIntervalRef.current) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = 0;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      stopSilenceMonitor();
      stopTracks();
      introAudioRef.current?.pause();
      questionAudioRef.current?.pause();
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [clearTimers, stopSilenceMonitor, stopTracks]);

  const playQuestionAtIndex = useCallback(
    async (index: number) => {
      const q = sortedQuestions[index];
      const el = questionAudioRef.current;
      const src = questionAudioUrl(q);
      if (!el || !src) return false;
      setIsPlayingPrompt(true);
      setSubmitError(null);
      try {
        await playAudioFile(el, src);
        return true;
      } catch {
        setIsPlayingPrompt(false);
        return false;
      }
    },
    [sortedQuestions]
  );

  const playIntroAudio = useCallback(async () => {
    const el = introAudioRef.current;
    const src = introAudioSrc;
    if (!el || !src) return false;
    setIsPlayingPrompt(true);
    setSubmitError(null);
    try {
      await playAudioFile(el, src);
      return true;
    } catch {
      setIsPlayingPrompt(false);
      return false;
    }
  }, [introAudioSrc]);

  const submitAll = useCallback(
    async (finalAnswers: BotConversationAnswer[], finalBlobs: Blob[]) => {
      setPhase("submitting");
      setSubmitError(null);
      setPendingSubmit({ answers: finalAnswers, blobs: finalBlobs });
      const mergedComments = finalAnswers
        .map((a) => `Q: ${a.questionText}\nA: ${a.transcript}`)
        .join("\n\n");
      const session = getSession();
      try {
        const created = await createBotFeedback({
          ...identity.getSubmitFields(),
          rating: 3,
          comments: mergedComments,
          source: session?.role === "staff" ? "staff" : "patient",
          submissionMode: "bot",
          conversationAnswers: finalAnswers,
          answerAudioBlobs: finalBlobs,
        });
        setPendingSubmit(null);
        navigate("/thank-you", {
          state: {
            fromStaffSession: session?.role === "staff",
            aiSummary: created.aiSummary || undefined,
            aiSentiment: created.aiSentiment || undefined,
            aiTopics: created.aiTopics || undefined,
          },
        });
      } catch (e) {
        setPhase("submit-failed");
        setSubmitError(e instanceof Error ? e.message : "Could not submit feedback");
      }
    },
    [navigate, identity]
  );

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearTimers();
    stopSilenceMonitor();

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      finishingRef.current = false;
      stopTracks();
      return;
    }
    const q = currentQuestion;
    if (!q) {
      finishingRef.current = false;
      return;
    }

    setQuestionPhase("processing");
    setStatusHint("பதிலைப் புரிந்து கொள்கிறோம்…");

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const b = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        resolve(b.size > 0 ? b : null);
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
    stopTracks();
    recorderRef.current = null;
    chunksRef.current = [];
    finishingRef.current = false;

    if (!blob) {
      setSubmitError("No voice captured. Speak again after the countdown.");
      setQuestionPhase("think");
      setThinkCountdown(thinkSeconds);
      return;
    }

    try {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const { transcript: raw } = await transcribeVoiceRecording(blob, `answer.${ext}`, "ta-IN");
      const transcript = coerceTranscriptText(raw).trim() || "(No speech detected.)";
      const row: BotConversationAnswer = {
        questionOrder: q.order,
        questionText: q.textTa,
        transcript,
      };

      const isLast = questionIndex + 1 >= sortedQuestions.length;
      setAnswers((prev) => {
        const nextAnswers = [...prev, row];
        setAnswerBlobs((prevBlobs) => {
          const nextBlobs = [...prevBlobs, blob];
          if (isLast) {
            void submitAll(nextAnswers, nextBlobs);
          }
          return nextBlobs;
        });
        return nextAnswers;
      });

      if (!isLast) {
        const nextIndex = questionIndex + 1;
        setQuestionIndex(nextIndex);
        setQuestionPhase("prompt");
        setSubmitError(null);
        setStatusHint(null);
        window.setTimeout(() => {
          void playQuestionAtIndex(nextIndex).then((ok) => {
            if (!ok) beginThinkCountdownRef.current();
          });
        }, 50);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not transcribe answer");
      setQuestionPhase("record");
    }
  }, [
    clearTimers,
    currentQuestion,
    questionIndex,
    sortedQuestions.length,
    stopSilenceMonitor,
    stopTracks,
    submitAll,
    playQuestionAtIndex,
    thinkSeconds,
  ]);

  const startSilenceMonitor = useCallback(
    (stream: MediaStream, onSilence: () => void) => {
      stopSilenceMonitor();
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const recordStart = Date.now();
      let speechStarted = false;
      let silenceStart = 0;

      silenceIntervalRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length) * 100;
        const loud = rms > SILENCE_RMS_THRESHOLD;
        if (loud) {
          speechStarted = true;
          silenceStart = 0;
        } else if (speechStarted && Date.now() - recordStart > MIN_RECORD_MS) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart >= SILENCE_MS) {
            stopSilenceMonitor();
            onSilence();
          }
        }
      }, 180);
    },
    [stopSilenceMonitor]
  );

  const startRecording = useCallback(async () => {
    setStatusHint("பதில் சொல்லுங்கள்… நிறுத்தினால் அடுத்த கேள்விக்குச் செல்வோம்");
    setSubmitError(null);
    stopTracks();
    stopSilenceMonitor();
    chunksRef.current = [];
    finishingRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setSubmitError("Microphone access was denied. Allow the mic and try again.");
      setQuestionPhase("think");
      return;
    }
    streamRef.current = stream;
    const mime = pickRecorderMime();
    try {
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      setQuestionPhase("record");

      startSilenceMonitor(stream, () => {
        void finishRecording();
      });

      recordTimerRef.current = window.setTimeout(() => {
        void finishRecording();
      }, MAX_RECORD_MS);
    } catch {
      stopTracks();
      setSubmitError("This browser cannot capture voice.");
      setQuestionPhase("think");
    }
  }, [finishRecording, startSilenceMonitor, stopSilenceMonitor, stopTracks]);

  const beginThinkCountdown = useCallback(() => {
    if (skipThinkCountdown) {
      clearTimers();
      void startRecording();
      return;
    }
    const secs = Math.min(30, Math.max(1, thinkSeconds));
    setQuestionPhase("think");
    setThinkCountdown(secs);
    let left = secs;
    thinkTimerRef.current = window.setInterval(() => {
      left -= 1;
      setThinkCountdown(left);
      if (left <= 0) {
        clearTimers();
        void startRecording();
      }
    }, 1000);
  }, [clearTimers, startRecording, thinkSeconds, skipThinkCountdown]);

  beginThinkCountdownRef.current = beginThinkCountdown;

  const onPromptEnded = useCallback(() => {
    setIsPlayingPrompt(false);
    beginThinkCountdown();
  }, [beginThinkCountdown]);

  const goToFirstQuestion = useCallback(() => {
    setQuestionIndex(0);
    setPhase("question");
    setQuestionPhase("prompt");
    setSubmitError(null);
    window.setTimeout(() => {
      void playQuestionAtIndex(0).then((ok) => {
        if (!ok) beginThinkCountdown();
      });
    }, 50);
  }, [playQuestionAtIndex, beginThinkCountdown]);

  const handleStartConversation = useCallback(() => {
    const identityError = identity.validateForSubmit();
    if (identityError) {
      setSubmitError(identityError);
      return;
    }
    if (!sortedQuestions.length) return;
    setSubmitError(null);
    setPendingSubmit(null);
    if (skipIntro) {
      goToFirstQuestion();
      return;
    }
    setPhase("intro");
    setSubmitError(null);
    void playIntroAudio().then((ok) => {
      if (!ok) goToFirstQuestion();
    });
  }, [identity, sortedQuestions.length, skipIntro, playIntroAudio, goToFirstQuestion]);

  if (phase === "loading") {
    return (
      <div className="max-w-3xl mx-auto p-8 flex items-center justify-center gap-3 text-gray-600">
        <Loader className="animate-spin" size={24} />
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <audio ref={introAudioRef} className="hidden" onEnded={goToFirstQuestion} />
      <audio ref={questionAudioRef} className="hidden" onEnded={onPromptEnded} />

      <div className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800">Voice conversation feedback</h2>
          <p className="text-sm text-gray-500">தமிழில் கேள்விகள் · பதில் குரலில்</p>
        </div>

        {loadError ? (
          <p className="mx-6 mt-4 text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
            {loadError}
          </p>
        ) : null}

        {phase === "identity" && (
          <div className="p-6 md:p-10 space-y-2">
            <p className="text-lg md:text-xl text-gray-700 text-center leading-relaxed mb-4">
              {config?.introText ||
                "வணக்கம்! MAPIMS மருத்துவமனையில் உங்கள் அனுபவத்தைப் பற்றி சில கேள்விகள் கேட்கிறோம்."}
            </p>

            <PatientIdentitySection identity={identity} primaryColor={primaryColor} />

            <p
              className="mb-6 border rounded-lg p-3 text-base font-medium text-gray-800 text-center"
              style={{ backgroundColor: primaryTint, borderColor: primarySoftBorder }}
            >
              {identity.identificationMode === "name" ? (
                identity.nameReady ? (
                  <>Ready to start, {identity.resolvedPatientName}.</>
                ) : (
                  "Please enter your name before starting the conversation."
                )
              ) : identity.identityReady ? (
                "Visit confirmed from EMR. You can start the conversation."
              ) : (
                "Look up your registration number and confirm your visit from EMR before starting."
              )}
            </p>

            {submitError && phase === "identity" ? (
              <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                {submitError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!identity.identityReady || !sortedQuestions.length}
              onClick={handleStartConversation}
              className="w-full py-4 md:py-5 rounded-2xl text-lg md:text-xl font-bold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-xl hover:scale-[1.01]"
              style={{ backgroundColor: primaryColor }}
            >
              Start conversation
            </button>
          </div>
        )}

        {phase === "intro" && (
          <div className="p-6 space-y-4 text-center">
            <div
              className="inline-flex items-center gap-3 px-5 py-4 rounded-2xl"
              style={{ backgroundColor: `${primaryColor}18` }}
            >
              <Volume2 size={28} style={{ color: primaryColor }} className={isPlayingPrompt ? "animate-pulse" : ""} />
              <div className="text-left">
                <p className="font-semibold text-gray-800">AI voice intro</p>
                <p className="text-sm text-gray-600">
                  {isPlayingPrompt ? "கேட்டுக்கொண்டிருக்கிறீர்கள்…" : "தயாராக இருங்கள்…"}
                </p>
              </div>
            </div>
            {!isPlayingPrompt && (
              <button
                type="button"
                onClick={() => {
                  void playIntroAudio().then((ok) => {
                    if (!ok) goToFirstQuestion();
                  });
                }}
                className="w-full py-3 rounded-xl font-bold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                {introAudioSrc ? "Play intro" : "Continue to questions"}
              </button>
            )}
          </div>
        )}

        {phase === "question" && currentQuestion && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                Question {questionIndex + 1} of {sortedQuestions.length}
              </span>
              <span className="font-medium text-gray-700">AI assistant</span>
            </div>

            {questionPhase === "prompt" && (
              <div className="py-8 text-center space-y-4">
                <div
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-full text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Volume2 size={22} className={isPlayingPrompt ? "animate-pulse" : ""} />
                  <span>{isPlayingPrompt ? "கேள்வி படிக்கிறது…" : "கேள்வி தயார்…"}</span>
                </div>
                <p className="text-lg font-medium text-gray-800 leading-relaxed px-2">
                  {currentQuestion.textTa}
                </p>
              </div>
            )}

            {questionPhase === "think" && (
              <div className="py-12 text-center">
                <p className="text-lg font-semibold text-gray-800 mb-2">சிறிது நேரம் யோசியுங்கள்…</p>
                <p className="text-5xl font-bold tabular-nums" style={{ color: primaryColor }}>
                  {thinkCountdown}
                </p>
                <p className="text-sm text-gray-500 mt-4">{currentQuestion.textTa}</p>
              </div>
            )}

            {questionPhase === "record" && (
              <div className="py-8 text-center space-y-4">
                <p className="text-lg font-medium text-gray-800">{currentQuestion.textTa}</p>
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white animate-pulse"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Mic size={20} />
                  Listening…
                </div>
                {statusHint ? <p className="text-sm text-gray-600">{statusHint}</p> : null}
              </div>
            )}

            {questionPhase === "processing" && (
              <div className="py-12 flex flex-col items-center gap-3 text-gray-600">
                <Loader className="animate-spin" size={32} />
                <p>{statusHint || "Processing…"}</p>
              </div>
            )}

            {submitError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                {submitError}
              </p>
            ) : null}
          </div>
        )}

        {phase === "submitting" && (
          <div className="p-12 flex flex-col items-center gap-3 text-gray-600">
            <Loader className="animate-spin" size={36} />
            <p className="font-medium">Submitting your feedback…</p>
          </div>
        )}

        {phase === "submit-failed" && pendingSubmit && (
          <div className="p-8 md:p-12 space-y-4 text-center">
            <p className="text-lg font-semibold text-gray-800">Could not save your feedback</p>
            {submitError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                {submitError}
              </p>
            ) : null}
            <p className="text-sm text-gray-600">
              Your answers are still here. Tap retry — you do not need to record again.
            </p>
            <button
              type="button"
              onClick={() => void submitAll(pendingSubmit.answers, pendingSubmit.blobs)}
              className="w-full py-4 rounded-2xl text-lg font-bold text-white shadow-lg"
              style={{ backgroundColor: primaryColor }}
            >
              Retry submit
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
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
