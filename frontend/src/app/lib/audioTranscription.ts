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

/** Sarvam's recommended input rate; also keeps 25s WAV chunks ~800 KB instead of ~2.4 MB at 48 kHz. */
const STT_SAMPLE_RATE = 16000;

async function resampleMono(
  samples: Float32Array,
  fromRate: number
): Promise<{ samples: Float32Array; sampleRate: number }> {
  if (fromRate === STT_SAMPLE_RATE || typeof OfflineAudioContext === "undefined") {
    return { samples, sampleRate: fromRate };
  }
  try {
    const length = Math.max(1, Math.ceil((samples.length * STT_SAMPLE_RATE) / fromRate));
    const offline = new OfflineAudioContext(1, length, STT_SAMPLE_RATE);
    const src = offline.createBuffer(1, samples.length, fromRate);
    src.copyToChannel(samples, 0);
    const node = offline.createBufferSource();
    node.buffer = src;
    node.connect(offline.destination);
    node.start();
    const rendered = await offline.startRendering();
    return { samples: rendered.getChannelData(0).slice(), sampleRate: STT_SAMPLE_RATE };
  } catch {
    return { samples, sampleRate: fromRate };
  }
}

/**
 * Transcribe audio via Sarvam REST.
 *
 * MediaRecorder WebM has no duration header, so Sarvam has to guess the clip
 * length — and it regularly misjudges the first segment of a session as longer
 * than 30s and rejects it with a 400 ("Audio duration exceeds the maximum limit
 * of 30 seconds"), silently dropping the opening seconds of the feedback.
 * Whenever the browser can decode the clip we therefore always send WAV (exact
 * length in the header), split into chunks under the 30s limit.
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

  if (!audioBuffer) {
    const { transcript } = await transcribeVoiceRecording(audioBlob, filename, languageCode);
    return { transcript: coerceTranscriptText(transcript) };
  }

  const { samples: mono, sampleRate } = await resampleMono(
    mixToMono(audioBuffer),
    audioBuffer.sampleRate
  );
  const baseName = filename.replace(/\.[^.]+$/, "") || "recording";
  const chunkSamples = Math.max(1, Math.floor(maxChunkSeconds * sampleRate));
  const parts: string[] = [];

  for (let offset = 0; offset < mono.length; offset += chunkSamples) {
    const end = Math.min(offset + chunkSamples, mono.length);
    const slice = mono.subarray(offset, end);
    const wavBlob = encodeMonoWav(slice, sampleRate);
    const chunkIdx = Math.floor(offset / chunkSamples);
    const { transcript: raw } = await transcribeVoiceRecording(
      wavBlob,
      `${baseName}-${chunkIdx}.wav`,
      languageCode
    );
    const text = coerceTranscriptText(raw).trim();
    if (text && text !== "(No speech detected.)") {
      parts.push(text);
    }
  }

  return { transcript: parts.join(" ").replace(/\s+/g, " ").trim() };
}
