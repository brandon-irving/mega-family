/// <reference types="vite/client" />
// G3 security review S4 (LOW): `POST /push/answer` must do equal work on every failure branch — a
// "notification not found" / "locked out" response must cost the same CPU time as a "wrong token"
// response, or the response TIMING itself becomes an oracle an attacker can use to tell those cases apart
// even though the response BODY never does. Verified by spying on the one real unit of work each branch
// does or skips: the HMAC `crypto.subtle.verify` call inside `verifyAnswerToken`.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeFakePushSender } from './adapters/fakePushSender';
import { __setChatModelForTests, __setPushSenderForTests } from './adapters/registry';
import { internal } from './_generated/api';
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
  const { familyId, members: rawMembers } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const members = rawMembers as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>>;
  const pushSender = makeFakePushSender();
  __setPushSenderForTests(pushSender);
  const notification = (await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect()))[0];
  return { t, notification };
}

describe('S4: /push/answer does equal work (one HMAC verify) on every failure branch', () => {
  test('a non-existent notification still runs exactly one crypto.subtle.verify, same as a wrong-token request', async () => {
    const { t, notification } = await seededWithPushedRequest();
    // A real, well-formed id that no longer resolves to any row — `ctx.db.get` returns `null` for this
    // (not a thrown ArgumentValidationError, which a syntactically-mangled string would trigger before
    // ever reaching the "not found" branch this test means to exercise).
    await t.run((ctx) => ctx.db.delete(notification._id));
    const verifySpy = vi.spyOn(crypto.subtle, 'verify');

    const res = await t.fetch('/push/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: notification._id, buttonId: 'yes', answerToken: `${Date.now() + 1_000_000}.${'ab'.repeat(32)}` }),
    });

    expect(res.status).toBe(400);
    expect(verifySpy).toHaveBeenCalledTimes(1); // not skipped — same shape of work as a real "wrong token" case
    verifySpy.mockRestore();
  });

  test('a locked-out notification still runs exactly one crypto.subtle.verify', async () => {
    const { t, notification } = await seededWithPushedRequest();
    await t.run((ctx) => ctx.db.patch(notification._id, { answerFailedAttempts: 999 }));
    const verifySpy = vi.spyOn(crypto.subtle, 'verify');

    const res = await t.fetch('/push/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: notification._id, buttonId: 'yes', answerToken: `${Date.now() + 1_000_000}.${'ab'.repeat(32)}` }),
    });

    expect(res.status).toBe(400);
    expect(verifySpy).toHaveBeenCalledTimes(1);
    verifySpy.mockRestore();
  });

  test('a wrong token on a real, open notification also runs exactly one crypto.subtle.verify (the baseline)', async () => {
    const { t, notification } = await seededWithPushedRequest();
    const verifySpy = vi.spyOn(crypto.subtle, 'verify');

    const res = await t.fetch('/push/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: notification._id, buttonId: 'yes', answerToken: `${Date.now() + 1_000_000}.${'ab'.repeat(32)}` }),
    });

    expect(res.status).toBe(400);
    expect(verifySpy).toHaveBeenCalledTimes(1);
    verifySpy.mockRestore();
  });
});
