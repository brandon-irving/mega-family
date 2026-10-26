// A scripted Transcriber for tests, mirroring `fakeChatModel.ts`.
import type { Transcriber, TranscriberRequest, TranscriberResult } from '../ports/transcriber';

export type TranscribeScript = (req: TranscriberRequest) => TranscriberResult | Promise<TranscriberResult>;

export function makeFakeTranscriber(script: TranscribeScript): Transcriber {
  return { transcribe: (req) => Promise.resolve(script(req)) };
}

export const defaultFakeTranscriber: Transcriber = makeFakeTranscriber(() => ({
  text: 'Hey, can you remind me about soccer practice?',
  audioDurationMs: 3600,
  turns: [{ text: 'Hey, can you remind me about soccer practice?', startMs: 0, endMs: 3600 }],
}));
