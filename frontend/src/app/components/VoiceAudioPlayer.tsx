import React, { useState } from "react";

type VoiceAudioPlayerProps = {
  src: string;
  className?: string;
};

export function VoiceAudioPlayer({ src, className = "w-full max-w-xl" }: VoiceAudioPlayerProps) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <p className="text-sm text-amber-700 rounded-lg border border-amber-100 bg-amber-50 p-3">
        Voice recording is not available on the server. The transcript was saved, but the audio
        file may be missing (for example after a server redeploy before uploads were persisted).
      </p>
    );
  }

  return (
    <audio
      controls
      className={className}
      preload="metadata"
      src={src}
      onError={() => setMissing(true)}
    >
      Your browser does not support audio playback.
    </audio>
  );
}
