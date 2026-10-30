// Talk mode's recorder, behind a port (user's "adapter driven" rule: feature code never imports a
// vendor SDK directly) so expo-audio is the only thing that knows it exists. Transcription itself is a
// server action (`talk.transcribe`, src/data/useTalk.ts) — this file only owns the microphone.
//
// A hook, not a plain singleton: expo-audio only exposes its recorder through `useAudioRecorder` (there
// is no exported `AudioRecorder` constructor or `createAudioRecorder()` factory, unlike `createAudioPlayer`)
// — `useVoiceService()` is the one place that calls it, and still returns nothing but the VoiceService
// interface, so talk.tsx never imports expo-audio itself.
//
// Format (G2 task: Meta's `/v1/asr/transcribe` only accepts WAV — mono, 16-bit PCM, 16/24 kHz; checked
// against the Voice API reference Oct 26 — convex/model/audioFormat.ts):
// - **iOS**: expo-audio's `IOSOutputFormat.LINEARPCM` (confirmed in the SDK 58 docs, Oct 26) records a real
//   mono 16-bit PCM `.wav` directly — no post-processing needed, and no more guaranteed-to-be-refused
//   AAC/.m4a upload (CONTRACT.md v0.8's non-WAV `VALIDATION` was actually firing on every iOS recording
//   before this).
// - **Web**: `MediaRecorder` can only produce `audio/webm` (opus) — there's no WAV output option at all.
//   After `stop()`, the webm clip is decoded with `AudioContext.decodeAudioData`, resampled to mono 16 kHz
//   with `OfflineAudioContext`, and encoded to PCM WAV with the pure `wavEncoder.ts` (unit-tested on its
//   own) — this file is the only place that touches those Web Audio APIs.
// - **Android**: expo-audio's `AndroidOutputFormat` (`default`/`3gp`/`mpeg4`/`amrnb`/`amrwb`/`aac_adts`/
//   `mpeg2ts`/`webm`, confirmed in the SDK 58 docs) has no linear-PCM/WAV container option — `MediaRecorder`
//   just can't produce one. `canRecordWav()` reports this so the UI can show a clear, friendly message
//   up front (talk.tsx) instead of recording something the server will always refuse.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { AudioModule, AudioQuality, IOSOutputFormat, RecordingPresets, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from 'expo-audio';
import { encodeWavPCM16 } from './wavEncoder';

export type RecordingHandle = { uri: string; mimeType: string; durationMs: number };

export interface VoiceService {
  /** Requests microphone permission if not already granted. */
  requestPermission(): Promise<boolean>;
  /** Starts (or resumes) recording. Rejects immediately (before touching the microphone) on a platform
   * `canRecordWav()` reports as unsupported. */
  start(): Promise<void>;
  /** Stops recording and returns the clip, or `null` if nothing was recorded. The returned `mimeType` is
   * always `audio/wav` — web re-encodes to it after stopping; iOS records it directly. A web clip remains
   * available until the next start, cancel, or unmount. */
  stop(): Promise<RecordingHandle | null>;
  /** Stops and discards whatever was being recorded — no upload, no transcript. */
  cancel(): Promise<void>;
}

/** Meta's transcribe endpoint's required format (convex/model/audioFormat.ts). */
const TARGET_SAMPLE_RATE = 16000;
const WAV_MIME_TYPE = 'audio/wav';

/** `start()`'s rejection message on a platform `canRecordWav()` reports as unsupported — exported so the
 * UI (src/app/talk.tsx) can recognize it and show it as-is instead of `errorCopyFor`'s generic fallback
 * (that helper only translates server `ConvexError` codes; this never reaches a server at all). */
export const VOICE_UNSUPPORTED_MESSAGE = "Voice isn't supported on this device yet.";

/** Whether this platform can actually produce the WAV Meta's endpoint requires — iOS natively, web by
 * re-encoding after recording. Android can't (see this file's docstring); the UI should check this before
 * ever opening the recorder. */
export function canRecordWav(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'web';
}

const WAV_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.wav',
  sampleRate: TARGET_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: TARGET_SAMPLE_RATE * 16, // uncompressed mono 16-bit: sampleRate * bitsPerSample
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: TARGET_SAMPLE_RATE,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  // android/web fields are required by RecordingOptions' type but unused: start() refuses on Android
  // before recording, and web always records through RecordingPresets.HIGH_QUALITY instead (below).
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

/** Resamples a decoded `AudioBuffer` to mono at `TARGET_SAMPLE_RATE` using `OfflineAudioContext` (the
 * browser's own resampler — no hand-rolled interpolation to get subtly wrong), then encodes it to WAV. Web
 * only; exported for its own more targeted test coverage if a browser test environment is ever added here
 * — covered live by the G2 report's manual check in the meantime (jsdom has no real Web Audio/decode). */
export async function decodeResampleAndEncodeWav(fileBlob: Blob): Promise<Blob> {
  const AudioContextCtor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(await fileBlob.arrayBuffer());
  } finally {
    await decodeCtx.close().catch(() => {});
  }

  const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE); // 1 channel: downmix to mono
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  try {
    const resampled = await offline.startRendering();
    const samples = resampled.getChannelData(0);
    const wavBuffer = encodeWavPCM16(samples, TARGET_SAMPLE_RATE);
    return new Blob([wavBuffer], { type: WAV_MIME_TYPE });
  } finally {
    source.disconnect();
    source.buffer = null;
  }
}

export function useVoiceService(): VoiceService {
  const recorder = useAudioRecorder(Platform.OS === 'ios' ? WAV_RECORDING_OPTIONS : RecordingPresets.HIGH_QUALITY);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const generationRef = useRef(0);
  const startingRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const wavUriRef = useRef<string | null>(null);

  const releaseClip = useCallback(() => {
    if (wavUriRef.current) URL.revokeObjectURL(wavUriRef.current);
    wavUriRef.current = null;
  }, []);

  const discardRecording = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      // Native useAudioRecorder may already have released the recorder during unmount.
    } finally {
      if (Platform.OS === 'web' && recorder.uri) URL.revokeObjectURL(recorder.uri);
    }
  }, [recorder]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const existing = await AudioModule.getRecordingPermissionsAsync();
    if (existing.granted) return true;
    const requested = await AudioModule.requestRecordingPermissionsAsync();
    return requested.granted;
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!canRecordWav()) throw new Error(VOICE_UNSUPPORTED_MESSAGE);
    const previousStart = startingRef.current;
    if (previousStart?.generation === generationRef.current) return previousStart.promise;
    if (recordingRef.current) return;
    releaseClip();
    const generation = ++generationRef.current;
    const pending = (async () => {
      // A cancelled preparation may still own the microphone. Finish its disposal before a new
      // attempt (including React's effect replay) prepares the same recorder again.
      if (previousStart) await previousStart.promise.catch(() => {});
      if (generation !== generationRef.current) return;
      const granted = await requestPermission();
      if (generation !== generationRef.current) return;
      if (!granted) throw new Error('Microphone permission denied');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (generation !== generationRef.current) return;
      await recorder.prepareToRecordAsync();
      if (generation !== generationRef.current) {
        // Expo's web recorder acquires the microphone during prepare and releases it on the stop
        // event. A prepared MediaRecorder must first be started so stop can deliver that event.
        if (Platform.OS === 'web') recorder.record();
        await discardRecording();
        return;
      }
      recorder.record();
      recordingRef.current = true;
      startedAtRef.current = Date.now();
    })();
    startingRef.current = { generation, promise: pending };
    try {
      await pending;
    } finally {
      if (startingRef.current?.generation === generation) startingRef.current = null;
    }
  }, [discardRecording, recorder, releaseClip, requestPermission]);

  const stop = useCallback(async (): Promise<RecordingHandle | null> => {
    const generation = ++generationRef.current;
    if (!recordingRef.current) return null;
    recordingRef.current = false;
    const durationMs = Date.now() - startedAtRef.current;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return null;

    if (Platform.OS !== 'web') return generation === generationRef.current ? { uri, mimeType: WAV_MIME_TYPE, durationMs } : null; // iOS already recorded WAV

    let recordedBlob: Blob;
    try {
      if (generation !== generationRef.current) return null;
      recordedBlob = await (await fetch(uri)).blob();
    } finally {
      // SDK 58's web recorder creates its own object URL without revoking it.
      URL.revokeObjectURL(uri);
    }
    if (generation !== generationRef.current) return null;
    const wavBlob = await decodeResampleAndEncodeWav(recordedBlob);
    if (generation !== generationRef.current) return null;
    const wavUri = URL.createObjectURL(wavBlob);
    wavUriRef.current = wavUri;
    return { uri: wavUri, mimeType: WAV_MIME_TYPE, durationMs };
  }, [recorder]);

  const cancel = useCallback(async (): Promise<void> => {
    generationRef.current += 1;
    releaseClip();
    if (!recordingRef.current) return;
    recordingRef.current = false;
    await discardRecording();
  }, [discardRecording, releaseClip]);

  useEffect(() => () => { void cancel(); }, [cancel]);

  return useMemo(() => ({ requestPermission, start, stop, cancel }), [requestPermission, start, stop, cancel]);
}
