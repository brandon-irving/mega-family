/// <reference types="vite/client" />
// CONTRACT §5 v0.11: `POST /push/answer` — answering a notification with an HMAC answerToken instead of a
// signed-in session, for iOS's killed-app background notification-response task. Drives the route through
// a real push send (convex/proactive.ts's `sendPush`, with a fake PushSender) so the token under test is
// exactly the one a real push payload would carry, not one hand-built to match the implementation.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeFakePushSender } from './adapters/fakePushSender';
import { __setChatModelForTests, __setPushSenderForTests } from './adapters/registry';
import { createAnswerToken } from './model/pushAnswerToken';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => {
  vi.useFakeTimers();
  process.env.PUSH_ANSWER_SECRET = 'test-secret-do-not-use-in-prod';
});
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
  __setPushSenderForTests(null);
  delete process.env.PUSH_ANSWER_SECRET;
});

async function seededWithPushedRequest() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const { familyId, members: rawMembers } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const members = rawMembers as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>>;
  await t.withIdentity({ subject: 'sample:admin' }).mutation(api.push.register, { token: 'ExponentPushToken[test]', platform: 'ios' });

  const pushSender = makeFakePushSender();
  __setPushSenderForTests(pushSender);
  const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner)).unique()))!;
  const mega = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner)).unique()))!;
  await t.mutation(internal.agent.tools.execute, {
    familyId,
    memberId: members.partner,
    megaId: mega._id,
    threadId: thread._id,
    name: 'ask_member',
    argumentsJson: JSON.stringify({ toMemberId: members.admin, text: 'Can you grab oat milk?', onAccept: { tool: 'lists_add', listName: 'Groceries', text: 'Oat milk' } }),
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const sent = pushSender.sent[0];
  const notificationId = sent.data.notificationId as Id<'notifications'>;
  const answerToken = sent.data.answerToken as string;
  return { t, familyId, members, notificationId, answerToken };
}

describe('POST /push/answer', () => {
  test('a valid token answers the notification and runs its real effect', async () => {
    const { t, familyId, notificationId, answerToken } = await seededWithPushedRequest();

    const res = await t.fetch('/push/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, buttonId: 'yes', answerToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toMatch(/you'll handle it/i);

    const notification = await t.run((ctx) => ctx.db.get(notificationId));
    expect(notification!.answer?.via).toBe('push');
    const list = (await t.run((ctx) => ctx.db.query('lists').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect())).find((l) => l.name === 'Groceries')!;
    const items = await t.run((ctx) => ctx.db.query('listItems').withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', list._id)).collect());
    expect(items.some((i) => i.text === 'Oat milk')).toBe(true);
  });

  test('idempotent: answering the same notification twice via the route never re-applies the effect', async () => {
    const { t, familyId, notificationId, answerToken } = await seededWithPushedRequest();
    const call = () => t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId, buttonId: 'yes', answerToken }) });

    const first = await (await call()).json();
    const second = await (await call()).json();
    expect(second.reply).toBe(first.reply);

    const list = (await t.run((ctx) => ctx.db.query('lists').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect())).find((l) => l.name === 'Groceries')!;
    const items = await t.run((ctx) => ctx.db.query('listItems').withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', list._id)).collect());
    expect(items.filter((i) => i.text === 'Oat milk')).toHaveLength(1);
  });

  test('a tampered token is rejected with the same generic error as everything else', async () => {
    const { t, notificationId, answerToken } = await seededWithPushedRequest();
    const tampered = answerToken.slice(0, -1) + (answerToken.at(-1) === 'a' ? 'b' : 'a');

    const res = await t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId, buttonId: 'yes', answerToken: tampered }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid request');
    const notification = await t.run((ctx) => ctx.db.get(notificationId));
    expect(notification!.answer).toBeUndefined();
  });

  test("a token scoped to a different notification doesn't answer this one", async () => {
    const { t, notificationId, familyId, members } = await seededWithPushedRequest();
    // A second, unrelated notification (the seed's own milk-request push) — a real token for it must not
    // work against the first notification.
    const otherNotification = (
      await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect())
    ).find((n) => n._id !== notificationId)!;
    const otherToken = await createAnswerToken(otherNotification._id, otherNotification.recipientId, Date.now());

    const res = await t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId, buttonId: 'yes', answerToken: otherToken }) });
    expect(res.status).toBe(400);
    const notification = await t.run((ctx) => ctx.db.get(notificationId));
    expect(notification!.answer).toBeUndefined();
  });

  test('an expired token is rejected', async () => {
    const { t, notificationId } = await seededWithPushedRequest();
    const notification = (await t.run((ctx) => ctx.db.get(notificationId)))!;
    const expiredToken = await createAnswerToken(notificationId, notification.recipientId, Date.now() - 365 * 24 * 60 * 60_000); // "issued" a year before now

    const res = await t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId, buttonId: 'yes', answerToken: expiredToken }) });
    expect(res.status).toBe(400);
  });

  test('an unknown button id is rejected the same generic way', async () => {
    const { t, notificationId, answerToken } = await seededWithPushedRequest();
    const res = await t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId, buttonId: 'not-a-real-button', answerToken }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid request');
  });

  test('malformed bodies never crash the route', async () => {
    const t = convexTest(schema, modules);
    const notJson = await t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json at all' });
    expect(notJson.status).toBe(400);
    const missingFields = await t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId: 'x' }) });
    expect(missingFields.status).toBe(400);
  });

  test('locks out further attempts against a notification after repeated failed verifications, even with the right token', async () => {
    const { t, notificationId, answerToken } = await seededWithPushedRequest();
    const wrong = () =>
      t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId, buttonId: 'yes', answerToken: 'deadbeef'.repeat(8) }) });
    for (let i = 0; i < 10; i++) expect((await wrong()).status).toBe(400);

    // the LIMITS.push.maxAnswerTokenAttempts-th+ failure locks the notification out — even the real token
    // now gets the same generic rejection.
    const res = await t.fetch('/push/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId, buttonId: 'yes', answerToken }) });
    expect(res.status).toBe(400);
    const notification = await t.run((ctx) => ctx.db.get(notificationId));
    expect(notification!.answer).toBeUndefined();
  });
});
