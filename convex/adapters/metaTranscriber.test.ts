// The real Transcriber adapter's request shape (multipart: a JSON `request` part + an `audio` part — PLAN.md
// smoke test results), against a fake `fetch`.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TranscriberError } from '../ports/transcriber';
import { metaTranscriber } from './metaTranscriber';

describe('metaTranscriber', () => {
  beforeEach(() => vi.stubEnv('META_API_KEY', 'test-key'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('posts multipart form with a JSON `request` part and an `audio` part, including vocabulary biasing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transcript: 'hey teal', audioDurationMs: 1200, turns: [{ text: 'hey teal', start: 0, end: 1200 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await metaTranscriber.transcribe({ audio: new TextEncoder().encode('fake-wav-bytes').buffer, audioEncoding: 'WAV', vocabulary: ['Teal', 'Coral'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/asr/transcribe');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const form = init.body as FormData;
    expect(form.get('audio')).toBeInstanceOf(Blob);
    const requestPart = form.get('request') as Blob;
    const settings = JSON.parse(await requestPart.text());
    expect(settings).toMatchObject({ audioEncoding: 'WAV', vocabulary: ['Teal', 'Coral'] });

    expect(result).toEqual({ text: 'hey teal', audioDurationMs: 1200, turns: [{ text: 'hey teal', startMs: 0, endMs: 1200 }] });
  });

  test('maps a non-ok response to TranscriberError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server on fire', { status: 500 })));
    const err = await metaTranscriber.transcribe({ audio: new ArrayBuffer(0), audioEncoding: 'WAV' }).catch((e) => e);
    expect(err).toBeInstanceOf(TranscriberError);
    expect((err as TranscriberError).code).toBe('SERVER_ERROR');
  });
});
