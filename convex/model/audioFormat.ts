// Maps an uploaded recording's stored content type to the `audioEncoding` Meta's batch transcribe endpoint
// (`POST /v1/asr/transcribe`) accepts. Checked against the Voice API reference (dev.meta.ai/docs, Oct 26):
// that endpoint takes **WAV only** — mono, 16-bit integer PCM, 16 kHz or 24 kHz, RIFF/WAVE container.
// Anything else (including AAC/.m4a and WebM/Opus — what the frontend actually records, since expo-audio
// can't record WAV cross-platform: .m4a on iOS/Android, .webm on web) returns `null` rather than being
// guessed at or silently sent as-is; `convex/talk.ts` turns a `null` into a clear VALIDATION error instead
// of a confusing 400 from Meta. No transcoding is attempted here — that would need an actual re-encode step
// (e.g. ffmpeg/afconvert), which is out of scope until the product decision to add one is made.
const WAV_CONTENT_TYPES = new Set(['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave']);

export function audioEncodingForContentType(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return WAV_CONTENT_TYPES.has(base) ? 'WAV' : null;
}
