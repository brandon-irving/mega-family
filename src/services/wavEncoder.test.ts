// Pure unit tests for the WAV (RIFF/PCM) encoder (G2 task 4: web has to turn its recorded webm/opus clip
// into the mono 16-bit PCM WAV Meta's /v1/asr/transcribe endpoint requires, since MediaRecorder can't
// produce WAV directly — see src/services/voice.ts). No browser APIs needed here: just the header bytes,
// sample count, and clipping behavior of the encoder itself.
import { encodeWavPCM16, WAV_HEADER_BYTES } from './wavEncoder';

function readAscii(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe('encodeWavPCM16', () => {
  test('writes a well-formed RIFF/WAVE/fmt /data header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const sampleRate = 16000;
    const buf = encodeWavPCM16(samples, sampleRate);
    const view = new DataView(buf);

    expect(readAscii(view, 0, 4)).toBe('RIFF');
    expect(readAscii(view, 8, 4)).toBe('WAVE');
    expect(readAscii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // fmt subchunk size (PCM)
    expect(view.getUint16(20, true)).toBe(1); // AudioFormat = PCM
    expect(view.getUint16(22, true)).toBe(1); // NumChannels = mono
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint16(32, true)).toBe(2); // BlockAlign = numChannels * bitsPerSample/8
    expect(view.getUint16(34, true)).toBe(16); // BitsPerSample
    expect(readAscii(view, 36, 4)).toBe('data');

    const dataSize = samples.length * 2;
    expect(view.getUint32(40, true)).toBe(dataSize);
    expect(view.getUint32(4, true)).toBe(36 + dataSize); // RIFF chunk size
    expect(view.getUint32(28, true)).toBe(sampleRate * 2); // ByteRate = sampleRate * blockAlign
  });

  test('buffer length and sample count match: header + 2 bytes per sample, nothing more, nothing less', () => {
    for (const n of [0, 1, 5, 1600]) {
      const buf = encodeWavPCM16(new Float32Array(n), 16000);
      expect(buf.byteLength).toBe(WAV_HEADER_BYTES + n * 2);
    }
  });

  test('encodes ordinary values losslessly within 16-bit int rounding', () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const view = new DataView(encodeWavPCM16(samples, 16000));
    expect(view.getInt16(WAV_HEADER_BYTES + 0, true)).toBe(0);
    expect(view.getInt16(WAV_HEADER_BYTES + 2, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(view.getInt16(WAV_HEADER_BYTES + 4, true)).toBe(Math.round(-0.5 * 0x8000));
  });

  test('clips (never wraps) samples outside [-1, 1]', () => {
    const samples = new Float32Array([1.5, -2, 3.7, -100]);
    const view = new DataView(encodeWavPCM16(samples, 16000));
    expect(view.getInt16(WAV_HEADER_BYTES + 0, true)).toBe(0x7fff); // clipped to +1 -> max positive int16
    expect(view.getInt16(WAV_HEADER_BYTES + 2, true)).toBe(-0x8000); // clipped to -1 -> min int16
    expect(view.getInt16(WAV_HEADER_BYTES + 4, true)).toBe(0x7fff);
    expect(view.getInt16(WAV_HEADER_BYTES + 6, true)).toBe(-0x8000);
  });

  test('exactly +1 and -1 land on the int16 boundaries without overflowing into the next sample', () => {
    const view = new DataView(encodeWavPCM16(new Float32Array([1, -1]), 16000));
    expect(view.getInt16(WAV_HEADER_BYTES + 0, true)).toBe(0x7fff);
    expect(view.getInt16(WAV_HEADER_BYTES + 2, true)).toBe(-0x8000);
  });
});
