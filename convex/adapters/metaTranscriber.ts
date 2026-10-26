// The real Transcriber adapter: Meta Model API's `POST /v1/asr/transcribe` (PLAN.md smoke test results —
// multipart: a JSON `request` part plus an `audio` part). No Node builtins needed: FormData/Blob are global
// in Convex's default runtime.
import { MODELS } from '../../shared/config/models';
import type { Transcriber, TranscriberRequest, TranscriberResult, TranscriberTurn } from '../ports/transcriber';
import { TranscriberError } from '../ports/transcriber';

function requireApiKey(): string {
  const key = process.env.META_API_KEY;
  if (!key) throw new TranscriberError('INVALID_REQUEST', 'META_API_KEY is not set');
  return key;
}

export const metaTranscriber: Transcriber = {
  async transcribe(req: TranscriberRequest): Promise<TranscriberResult> {
    const key = requireApiKey();
    const settings: Record<string, unknown> = { model: MODELS.transcribe.model, audioEncoding: req.audioEncoding };
    // Vocabulary biasing for MEGA names (PLAN.md smoke test: "vocabulary biasing is available for MEGA
    // names"). The provider's exact field name wasn't in the Oct 26 smoke test; `vocabulary` matches the
    // Voice API reference's biasing shape — revisit if the live check shows otherwise.
    if (req.vocabulary?.length) settings.vocabulary = req.vocabulary;

    const form = new FormData();
    form.append('request', new Blob([JSON.stringify(settings)], { type: 'application/json' }));
    form.append('audio', new Blob([req.audio], { type: `audio/${req.audioEncoding.toLowerCase()}` }), 'audio');

    const res = await fetch(`${MODELS.meta.baseUrl}/asr/transcribe?sessionId=mega-${Date.now()}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const code = res.status === 429 ? 'RATE_LIMITED' : res.status >= 500 ? 'SERVER_ERROR' : 'INVALID_REQUEST';
      throw new TranscriberError(code, `Meta Model API transcribe ${res.status}: ${text.slice(0, 500)}`, res.status);
    }

    const json = (await res.json()) as { transcript?: string; audioDurationMs?: number; turns?: { text: string; start?: number; end?: number }[] };
    const turns: TranscriberTurn[] = (json.turns ?? []).map((t) => ({ text: t.text, startMs: t.start, endMs: t.end }));
    return { text: json.transcript ?? '', audioDurationMs: json.audioDurationMs ?? 0, turns };
  },
};
