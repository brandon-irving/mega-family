// Content-type → Meta `audioEncoding` mapping (convex/model/audioFormat.ts). Meta's batch transcribe
// endpoint only accepts WAV (Voice API reference, checked Oct 26) — the frontend records AAC `.m4a` on
// iOS/Android and `audio/webm` on web (expo-audio can't record WAV cross-platform), so those must map to
// `null` (unsupported), not be guessed at.
import { describe, expect, test } from 'vitest';
import { audioEncodingForContentType } from './audioFormat';

describe('audioEncodingForContentType', () => {
  test.each(['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave', 'AUDIO/WAV', 'audio/wav;codec=1'])('%s -> WAV', (ct) => {
    expect(audioEncodingForContentType(ct)).toBe('WAV');
  });

  test.each(['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mpeg'])('%s -> null (not supported by the transcribe endpoint)', (ct) => {
    expect(audioEncodingForContentType(ct)).toBeNull();
  });

  test('null/undefined/empty content type -> null', () => {
    expect(audioEncodingForContentType(null)).toBeNull();
    expect(audioEncodingForContentType(undefined)).toBeNull();
    expect(audioEncodingForContentType('')).toBeNull();
  });
});
