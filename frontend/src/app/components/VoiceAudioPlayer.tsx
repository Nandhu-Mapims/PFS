import React, { useRef, useState } from "react";

type VoiceAudioPlayerProps = {
  src: string;
  className?: string;
  onUnavailable?: () => void;
};

const isWebm = (src: string) => /\.webm(?:[?#]|$)/i.test(src);

const withM4aFormat = (src: string) => `${src}${src.includes("?") ? "&" : "?"}format=m4a`;

// iOS Safari can't play MediaRecorder WebM/Opus; the backend serves an AAC copy instead.
function canPlayWebm(): boolean {
  if (typeof document === "undefined") return true;
  return document.createElement("audio").canPlayType('audio/webm; codecs="opus"') === "probably";
}

export function VoiceAudioPlayer({
  src,
  className = "w-full max-w-xl",
  onUnavailable,
}: VoiceAudioPlayerProps) {
  const [missing, setMissing] = useState(false);
  const [m4aFallbackFor, setM4aFallbackFor] = useState<string | null>(null);
  // MediaRecorder WebM has no duration header, so browsers report Infinity and the
  // seek bar / start position misbehave. Seeking far past the end forces the browser
  // to scan the file for the real duration; we then rewind to 0.
  const resolvingDuration = useRef(false);

  if (missing) return null;

  const useM4a = isWebm(src) && (m4aFallbackFor === src || !canPlayWebm());
  const playbackSrc = useM4a ? withM4aFormat(src) : src;

  const rewindIfResolved = (el: HTMLAudioElement) => {
    if (!resolvingDuration.current || !Number.isFinite(el.duration)) return;
    resolvingDuration.current = false;
    el.currentTime = 0;
  };

  return (
    <audio
      controls
      className={className}
      preload="metadata"
      src={playbackSrc}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        if (Number.isFinite(el.duration)) {
          resolvingDuration.current = false;
          return;
        }
        resolvingDuration.current = true;
        el.currentTime = 1e101;
      }}
      onDurationChange={(e) => rewindIfResolved(e.currentTarget)}
      onTimeUpdate={(e) => rewindIfResolved(e.currentTarget)}
      onError={() => {
        if (isWebm(src) && !useM4a) {
          setM4aFallbackFor(src);
          return;
        }
        setMissing(true);
        onUnavailable?.();
      }}
    >
      Your browser does not support audio playback.
    </audio>
  );
}
