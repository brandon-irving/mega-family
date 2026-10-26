// Talk mode's recording/transcription, behind a port so expo-audio (and the real talk.transcribe
// action) can slot in later without the screen changing. G1 stubs captions and mentions.
import type { SpokenMention } from '@shared/domain/messages';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceService {
  startListening(): Promise<void>;
  /** Release to send: stops listening and resolves with the transcript + any @-mentions heard. */
  stopListening(): Promise<{ text: string; mentions: SpokenMention[] }>;
  cancel(): void;
}

class StubVoiceService implements VoiceService {
  async startListening() {}

  async stopListening() {
    return { text: '', mentions: [] };
  }

  cancel() {}
}

export const voice: VoiceService = new StubVoiceService();
