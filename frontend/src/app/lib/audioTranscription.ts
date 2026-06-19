import {
  coerceTranscriptText,
  transcribeVoiceRecording,
  type SpeechLanguageCode,
} from "./api";

/** Sarvam REST STT accepts up to 30s; stay under for safety margin. */
export const SARVAM_REST_MAX_CHUNK_SECONDS = 25;

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      out[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return out;
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    const raw = await blob.arrayBuffer();
    return await ctx.decodeAudioData(raw.slice(0));
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Transcribe audio via Sarvam REST. Splits clips longer than ~25s into WAV chunks.
 */
export async function transcribeVoiceRecordingChunked(
  audioBlob: Blob,
  filename = "recording.webm",
  languageCode: SpeechLanguageCode = "unknown",
  maxChunkSeconds = SARVAM_REST_MAX_CHUNK_SECONDS
): Promise<{ transcript: string }> {
  if (!audioBlob.size) return { transcript: "" };

  let audioBuffer: AudioBuffer | null = null;
  try {
    audioBuffer = await decodeAudioBlob(audioBlob);
  } catch {
    audioBuffer = null;
  }

  if (!audioBuffer || audioBuffer.duration <= maxChunkSeconds) {
    const { transcript } = await transcribeVoiceRecording(audioBlob, filename, languageCode);
    return { transcript: coerceTranscriptText(transcript) };
  }

  const sampleRate = audioBuffer.sampleRate;
  const mono = mixToMono(audioBuffer);
  const chunkSamples = Math.max(1, Math.floor(maxChunkSeconds * sampleRate));
  const parts: string[] = [];

  for (let offset = 0; offset < mono.length; offset += chunkSamples) {
    const end = Math.min(offset + chunkSamples, mono.length);
    const slice = mono.subarray(offset, end);
    const wavBlob = encodeMonoWav(slice, sampleRate);
    const chunkIdx = Math.floor(offset / chunkSamples);
    const { transcript: raw } = await transcribeVoiceRecording(
      wavBlob,
      `chunk-${chunkIdx}.wav`,
      languageCode
    );
    const text = coerceTranscriptText(raw).trim();
    if (text && text !== "(No speech detected.)") {
      parts.push(text);
    }
  }

  return { transcript: parts.join(" ").replace(/\s+/g, " ").trim() };
}
