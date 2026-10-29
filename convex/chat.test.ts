/// <reference types="vite/client" />
// Chat replies are server-driven (G1 fix): chat.send schedules generateReply, which writes the reply into
// its stream and then onto the message. Found by the G1 browser check, where the old client-driven
// /chat-stream route was never called and replies stuck at "…". The stream stays readable only by the
// thread's owner (and parents, when allowed), checked through chat.streamBody.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeFakeChatModel, textReply } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { KID_INTRO } from '../shared/config/starters';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

async function seeded() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const { familyId, members: raw } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, familyId, members: raw as unknown as Record<Key, Id<'members'>> };
}

describe('chat.send → server-driven reply', () => {
  test('the reply streams in and lands on the message without any client driving it', async () => {
    const { t } = await seeded();
    const asAdmin = t.withIdentity({ subject: 'sample:admin' });
    const { streamId, replyMessageId } = await asAdmin.mutation(api.chat.send, { text: 'hi', via: 'text' });
    expect((await asAdmin.query(api.chat.streamBody, { streamId })).status).toBe('pending');

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const body = await asAdmin.query(api.chat.streamBody, { streamId });
    expect(body.status).toBe('done');
    expect(body.text.length).toBeGreaterThan(10);
    const reply = await t.run((ctx) => ctx.db.get(replyMessageId));
    expect(reply?.body).toMatchObject({ type: 'text', text: body.text });
  });

  test("another member can't read the stream", async () => {
    const { t } = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.send, { text: 'hi', via: 'text' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.withIdentity({ subject: 'sample:twin1' }).query(api.chat.streamBody, { streamId })).rejects.toThrow();
  });
});

describe('chat.send → G6 #6b: the "Ready for tomorrow" chat-starter must ground its answer in tonight’s real checklist', () => {
  test('shows the kid’s own current routine card — never a free model answer that can drift onto a different day’s checklist', async () => {
    const { t, familyId, members } = await seeded();
    const asTwin2 = t.withIdentity({ subject: 'sample:twin2' });

    let modelCalls = 0;
    __setChatModelForTests(makeFakeChatModel(() => (modelCalls++, textReply('water bottle and shoes')))); // what the walkthrough actually saw — must never be reached

    const bedtimeRun = (await t.run((ctx) => ctx.db.query('routineRuns').withIndex('by_family_member_kind_date', (q) => q.eq('familyId', familyId).eq('memberId', members.twin2).eq('kind', 'bedtime')).first()))!;

    const ask = KID_INTRO.rows.find((r) => r.id === 'tomorrow')!.ask;
    const { replyMessageId } = await asTwin2.mutation(api.chat.send, { text: ask, via: 'text' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const reply = await t.run((ctx) => ctx.db.get(replyMessageId));
    expect(reply?.body).toMatchObject({ type: 'card', card: { kind: 'routine' } });
    if (reply?.body.type === 'card' && reply.body.card.kind === 'routine') {
      expect(reply.body.card.runId).toBe(bedtimeRun._id);
    }
    expect(modelCalls).toBe(0); // grounded directly from routines.ts, never the free model path
  });

  // G6 review fix: the shortcut matched on text alone, so it could also fire with an attachment attached
  // (dropping the photo on the floor — nothing in the shortcut path stores `args.attachments`) or in voice/
  // talk mode (returning `streamId: ''`, which talk mode can't caption — it always needs a text stream).
  // The shortcut now requires `args.via === 'text'` and no attachments; everything else falls through to
  // the normal agent-loop path.
  test('an attachment with the exact starter text: the photo is still stored and the normal path runs', async () => {
    const { t } = await seeded();
    const asTwin2 = t.withIdentity({ subject: 'sample:twin2' });
    const photo = await t.run((ctx) => ctx.storage.store(new Blob(['png-bytes'], { type: 'image/png' })));

    __setChatModelForTests(makeFakeChatModel(() => textReply('normal agent reply')));

    const ask = KID_INTRO.rows.find((r) => r.id === 'tomorrow')!.ask;
    const { replyMessageId, streamId } = await asTwin2.mutation(api.chat.send, { text: ask, via: 'text', attachments: [photo] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(streamId).not.toBe('');
    const reply = await t.run((ctx) => ctx.db.get(replyMessageId));
    expect(reply?.body.type).toBe('text'); // never the shortcut's routine card
    const threadMessages = await t.run((ctx) =>
      ctx.db
        .query('messages')
        .withIndex('by_family_thread_at', (q) => q.eq('familyId', reply!.familyId).eq('threadId', reply!.threadId))
        .collect(),
    );
    const attachmentMessage = threadMessages.find((m) => m.body.type === 'image');
    expect(attachmentMessage?.body).toMatchObject({ type: 'image', storageId: photo });
  });

  test('voice (talk mode) with the exact starter text: the normal path runs and returns a non-empty streamId', async () => {
    const { t } = await seeded();
    const asTwin2 = t.withIdentity({ subject: 'sample:twin2' });

    __setChatModelForTests(makeFakeChatModel(() => textReply('normal agent reply')));

    const ask = KID_INTRO.rows.find((r) => r.id === 'tomorrow')!.ask;
    const { replyMessageId, streamId } = await asTwin2.mutation(api.chat.send, { text: ask, via: 'voice' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(streamId).not.toBe(''); // talk mode always needs a readable stream to caption
    const reply = await t.run((ctx) => ctx.db.get(replyMessageId));
    expect(reply?.body.type).toBe('text'); // never the shortcut's routine card
  });
});
