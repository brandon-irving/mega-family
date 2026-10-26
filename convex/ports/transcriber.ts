// The Transcriber port (CONTRACT §8; CONTRACT §4 `talk.transcribe`). Feature code never calls the Meta
// Model API's `/v1/asr/transcribe` directly — only through this interface.
export interface TranscriberTurn {
  text: string;
  startMs?: number;
  endMs?: number;
}

export interface TranscriberRequest {
  /** Raw audio bytes. */
  audio: ArrayBuffer;
  /** e.g. "WAV"; passed through to the provider's `audioEncoding`. */
  audioEncoding: string;
  /** The family's MEGA names, passed as vocabulary biasing (PLAN.md smoke test: "vocabulary biasing is
   * available for MEGA names"). */
  vocabulary?: string[];
}

export interface TranscriberResult {
  text: string;
  audioDurationMs: number;
  turns: TranscriberTurn[];
}

export type TranscriberErrorCode = 'RATE_LIMITED' | 'SERVER_ERROR' | 'INVALID_REQUEST' | 'UNKNOWN';

export class TranscriberError extends Error {
  readonly code: TranscriberErrorCode;
  readonly status?: number;
  constructor(code: TranscriberErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'TranscriberError';
    this.code = code;
    this.status = status;
  }
}

export interface Transcriber {
  transcribe(req: TranscriberRequest): Promise<TranscriberResult>;
}
