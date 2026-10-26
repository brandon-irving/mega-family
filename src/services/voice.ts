// Talk mode's recorder, behind a port (user's "adapter driven" rule: feature code never imports a
// vendor SDK directly) so expo-audio is the only thing that knows it exists. Transcription itself is a
// server action (`talk.transcribe`, src/data/useTalk.ts) — this file only owns the microphone.
//
// A hook, not a plain singleton: expo-audio only exposes its recorder through `useAudioRecorder` (there
// is no exported `AudioRecorder` constructor or `createAudioRecorder()` factory, unlike `createAudioPlayer`)
// — `useVoiceService()` is the one place that calls it, and still returns nothing but the VoiceService
// interface, so talk.tsx never imports expo-audio itself.
//
// Format (G2 decision, reported to the backend track): `RecordingPresets.HIGH_QUALITY` records `.m4a`
// (AAC) on iOS/Android and `audio/webm` on web — there is no WAV/linear-PCM container option for Android
// in expo-audio's `AndroidOutputFormat` (only default/3gp/mpeg4/amrnb/amrwb/aac_adts/mpeg2ts/webm), so a
// cross-platform WAV recording isn't possible here. The upload carries the real `Content-Type`
// (`audio/mp4` native, `audio/webm` web) so `talk.transcribe` can pick the matching `audioEncoding`
// instead of assuming "WAV" (CONTRACT.md's smoke-test note) — see the G2 report.
import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';

export type RecordingHandle = { uri: string; mimeType: string; durationMs: number };

export interface VoiceService {
  /** Requests microphone permission if not already granted. */
  requestPermission(): Promise<boolean>;
  /** Starts (or resumes) recording. */
  start(): Promise<void>;
  /** Stops recording and returns the clip, or `null` if nothing was recorded. */
  stop(): Promise<RecordingHandle | null>;
  /** Stops and discards whatever was being recorded — no upload, no transcript. */
  cancel(): Promise<void>;
}

const MIME_TYPE = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4'; // .m4a is an MPEG-4 container

export function useVoiceService(): VoiceService {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const existing = await AudioModule.getRecordingPermissionsAsync();
    if (existing.granted) return true;
    const requested = await AudioModule.requestRecordingPermissionsAsync();
    return requested.granted;
  }, []);

  const start = useCallback(async (): Promise<void> => {
    const granted = await requestPermission();
    if (!granted) throw new Error('Microphone permission denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordingRef.current = true;
    startedAtRef.current = Date.now();
  }, [recorder, requestPermission]);

  const stop = useCallback(async (): Promise<RecordingHandle | null> => {
    if (!recordingRef.current) return null;
    recordingRef.current = false;
    const durationMs = Date.now() - startedAtRef.current;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return null;
    return { uri, mimeType: MIME_TYPE, durationMs };
  }, [recorder]);

  const cancel = useCallback(async (): Promise<void> => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    try {
      await recorder.stop();
    } catch {
      // already stopped/unloaded — nothing to clean up
    }
  }, [recorder]);

  return { requestPermission, start, stop, cancel };
}
