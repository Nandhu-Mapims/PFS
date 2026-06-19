import React, { useState } from "react";

type VoiceAudioPlayerProps = {
  src: string;
  className?: string;
  onUnavailable?: () => void;
};

export function VoiceAudioPlayer({
  src,
  className = "w-full max-w-xl",
  onUnavailable,
}: VoiceAudioPlayerProps) {
  const [missing, setMissing] = useState(false);

  if (missing) return null;

  return (
    <audio
      controls
      className={className}
      preload="metadata"
      src={src}
      onError={() => {
        setMissing(true);
        onUnavailable?.();
      }}
    >
      Your browser does not support audio playback.
    </audio>
  );
}
