/// <reference types="vite/client" />
// Chat replies are server-driven (G1 fix): chat.send schedules generateReply, which writes the reply into
// its stream and then onto the message. Found by the G1 browser check, where the old client-driven
// /chat-stream route was never called and replies stuck at "…". The stream stays readable only by the
// thread's owner (and parents, when allowed), checked through chat.streamBody.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seeded() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return t;
}

describe('chat.send → server-driven reply', () => {
  test('the reply streams in and lands on the message without any client driving it', async () => {
    const t = await seeded();
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
    const t = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.send, { text: 'hi', via: 'text' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.withIdentity({ subject: 'sample:twin1' }).query(api.chat.streamBody, { streamId })).rejects.toThrow();
  });
});
