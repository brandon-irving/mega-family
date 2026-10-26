/// <reference types="vite/client" />
// `talk.transcribe`: the real Transcriber call (behind the Fake adapter in tests), format validation
// (G2 frontend requirement: the app uploads AAC `.m4a`/`audio/webm`, which Meta's transcribe endpoint
// doesn't accept — see convex/model/audioFormat.ts), vocabulary biasing, and mention resolution.
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { __setChatModelForTests, __setTranscriberForTests } from './adapters/registry';
import { makeFakeChatModel, jsonReply } from './adapters/fakeChatModel';
import { makeFakeTranscriber } from './adapters/fakeTranscriber';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

function codeOf(err: unknown): string | undefined {
  return err instanceof ConvexError ? (err.data as { code?: string }).code : undefined;
}

async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return t;
}

describe('talk.transcribe', () => {
  test('a WAV upload transcribes and resolves spoken MEGA mentions (via the family roster as vocabulary)', async () => {
    const t = await seeded();
    __setTranscriberForTests(
      makeFakeTranscriber((req) => {
        expect(req.audioEncoding).toBe('WAV');
        expect(req.vocabulary).toEqual(expect.arrayContaining(['Teal', 'Coral', 'Zap', 'Sunny']));
        return { text: 'Hey Teal, remind me about soccer', audioDurationMs: 2000, turns: [] };
      }),
    );
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ isMegaName: true })));

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })));
    const result = await t.withIdentity({ subject: 'sample:admin' }).action(api.talk.transcribe, { storageId });

    expect(result.text).toBe('Hey Teal, remind me about soccer');
    expect(result.mentions.some((m) => m.heard.toLowerCase() === 'teal')).toBe(true);

    __setTranscriberForTests(null);
    __setChatModelForTests(null);
  });

  test('an unsupported recording format (AAC .m4a) is refused with VALIDATION, never reaching the transcriber', async () => {
    const t = await seeded();
    let called = false;
    __setTranscriberForTests(makeFakeTranscriber(() => ((called = true), { text: 'should not run', audioDurationMs: 0, turns: [] })));

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' })));
    const err = await t
      .withIdentity({ subject: 'sample:admin' })
      .action(api.talk.transcribe, { storageId })
      .catch((e) => e);

    expect(codeOf(err)).toBe('VALIDATION');
    expect(called).toBe(false);

    __setTranscriberForTests(null);
  });

  test('audio/webm (the web recording format) is also refused — webm/Opus is not in the transcribe endpoint\'s supported list', async () => {
    const t = await seeded();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm;codecs=opus' })));
    const err = await t
      .withIdentity({ subject: 'sample:admin' })
      .action(api.talk.transcribe, { storageId })
      .catch((e) => e);
    expect(codeOf(err)).toBe('VALIDATION');
  });
});
