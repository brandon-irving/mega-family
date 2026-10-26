// A small, pure, synchronous WAV (RIFF/PCM) encoder — no dependencies, no browser APIs, unit-testable on
// its own. Used by src/services/voice.ts to turn web's decoded-and-resampled recording into the mono
// 16-bit PCM WAV Meta's `/v1/asr/transcribe` endpoint requires (CONTRACT.md v0.8; convex/model/
// audioFormat.ts) — `MediaRecorder` itself can only produce webm/opus on web, never WAV.

export const WAV_HEADER_BYTES = 44;

/** Encodes mono, 16-bit PCM WAV (RIFF/WAVE container) from samples in [-1, 1] at `sampleRate`. Clips
 * (never wraps) anything outside that range, so a hot input never aliases into noise. */
export function encodeWavPCM16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    offset += s.length;
  };
  const writeUint32 = (v: number) => {
    view.setUint32(offset, v, true);
    offset += 4;
  };
  const writeUint16 = (v: number) => {
    view.setUint16(offset, v, true);
    offset += 2;
  };

  writeString('RIFF');
  writeUint32(36 + dataSize); // chunk size: everything after this field
  writeString('WAVE');
  writeString('fmt ');
  writeUint32(16); // fmt subchunk size (16 = PCM, no extension)
  writeUint16(1); // AudioFormat = 1 (PCM, uncompressed — not IEEE float)
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(bitsPerSample);
  writeString('data');
  writeUint32(dataSize);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetric range (-32768..32767): scale negative values by 0x8000, positive by 0x7fff, so +1/-1 land
    // exactly on the int16 boundaries instead of +1 overflowing into the next sample's bytes.
    const int16 = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return buffer;
}
