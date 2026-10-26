// The Speaker port (PLAN "Talk mode": "a text-to-speech service gets added behind a Speaker port when
// ready"). Feature code (talk.tsx) only ever calls `speaker`, never `expo-speech` directly. Gated by
// `SPEAKER_CONFIG.enabled` (shared/config/speaker.ts, default off) — with it off this is a no-op, so
// turning spoken replies on later is a config edit, not a code change.
import * as Speech from 'expo-speech';
import { SPEAKER_CONFIG } from '@shared/config/speaker';

export interface SpeakerService {
  speak(text: string): void;
  stop(): void;
}

class ExpoSpeaker implements SpeakerService {
  speak(text: string): void {
    if (!text.trim()) return;
    Speech.stop();
    Speech.speak(text);
  }

  stop(): void {
    Speech.stop();
  }
}

class NoopSpeaker implements SpeakerService {
  speak(): void {}
  stop(): void {}
}

export const speaker: SpeakerService = SPEAKER_CONFIG.enabled ? new ExpoSpeaker() : new NoopSpeaker();
