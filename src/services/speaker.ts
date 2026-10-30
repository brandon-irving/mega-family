import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';

export type PlaybackCallbacks = { onStart?: () => void; onDone?: () => void; onError?: (error: unknown) => void };
// A generation prevents a cancelled preparation from speaking after a new recording starts.
let generation = 0;
export const speaker = {
  speak(text: string, callbacks: PlaybackCallbacks = {}) {
    const current = ++generation;
    const valid = () => current === generation;
    void (async () => {
      await Speech.stop();
      if (!valid()) return;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false, shouldPlayInBackground: false });
      if (!valid()) return;
      if (!text.trim()) { callbacks.onDone?.(); return; }
      Speech.speak(text, {
        useApplicationAudioSession: true,
        onStart: () => { if (valid()) callbacks.onStart?.(); },
        onDone: () => { if (valid()) callbacks.onDone?.(); },
        onError: (error) => { if (valid()) callbacks.onError?.(error); },
      });
    })().catch(error => { if (valid()) callbacks.onError?.(error); });
  },
  stop() { generation++; void Speech.stop().catch(() => {}); },
};
