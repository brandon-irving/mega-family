/// <reference types="vite/client" />
// G3 correctness review C7 (MEDIUM): per the current Expo push docs, a ticket's immediate "ok" status
// isn't proof of delivery — some failures (notably `DeviceNotRegistered`) only show up later via a
// separate `getReceipts` poll. `sendPush` stores each ok ticket's id and schedules `checkPushReceipts`
// ~`LIMITS.push.receiptCheckDelayMinutes` later; that action prunes a token whose receipt comes back
// `DeviceNotRegistered` and logs (without pruning) any other receipt error.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakePushSender } from './adapters/fakePushSender';
import { __setChatModelForTests, __setPushSenderForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { clock } from './ports/clock';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
  __setPushSenderForTests(null);
});

async function seededWithAPush() {
  const t = convexTest(schema, modules);
  const { familyId, members: rawMembers } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const members = rawMembers as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>>;
  await t.withIdentity({ subject: 'sample:admin' }).mutation(api.push.register, { token: 'ExponentPushToken[test]', platform: 'ios' });
  // Scores only the reminder under test high — an incidental daily check-in candidate (convex/model/
  // proactive.ts `scanCheckInTriggers`) could otherwise also score high and send a second, unrelated push,
  // making this suite's "exactly one ticket" assertions flaky (same determinism note as convex/
  // proactive.test.ts's own reminder tests).
  __setChatModelForTests(
    makeFakeChatModel((req) => {
      const userText = req.messages.find((m) => m.role === 'user')?.content ?? '';
      if (userText.includes('Take out the recycling')) return jsonReply({ kind: 'reminder', title: 'Recycling', text: 'Recycling goes out tonight!', score: 0.9, reason: 'due' });
      return jsonReply({ kind: 'update', title: 'Good morning', text: 'Good morning!', score: 0, reason: 'incidental check-in, not under test' });
    }),
  );
  const pushSender = makeFakePushSender();
  __setPushSenderForTests(pushSender);

  const now = await t.run((ctx) => clock.now(ctx, familyId));
  const reminderId = await t.run((ctx) => ctx.db.insert('reminders', { familyId, forMemberId: members.admin, text: 'Take out the recycling', dueAt: now, done: false, createdBy: members.admin }));
  await t.mutation(internal.proactive.tickFamily, { familyId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const settings = (await t.run((ctx) => ctx.db.query('settings').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', members.admin)).unique()))!;
  return { t, familyId, members, pushSender, settings, reminderId };
}

// `sendPush` schedules `checkPushReceipts` ~`LIMITS.push.receiptCheckDelayMinutes` later — but
// convex-test's `finishAllScheduledFunctions(vi.runAllTimers)` fast-forwards ALL pending timers regardless
// of how far in the future (it already ran the FIRST, "ok" receipt check as part of draining `sendPush`
// itself, inside `seededWithAPush`). So these tests call `checkPushReceipts` directly with a scripted
// receipt outcome — a direct, deterministic unit test of its own pruning/logging logic, decoupled from
// exactly when the scheduler happens to wake it.
describe('C7: push receipts — prune on DeviceNotRegistered, log (not prune) on other errors', () => {
  test('a ticket whose receipt comes back DeviceNotRegistered gets its token pruned', async () => {
    const { t, pushSender, settings } = await seededWithAPush();
    expect(pushSender.sent).toHaveLength(1);
    const ticketId = Object.keys(pushSender.receiptsFor)[0];
    expect(ticketId).toBeDefined(); // the ticket id really was captured by sendPush
    pushSender.receiptsFor[ticketId] = { id: ticketId, ok: false, error: 'DeviceNotRegistered' };

    await t.action(internal.proactive.checkPushReceipts, { settingsId: settings._id, tickets: [{ token: 'ExponentPushToken[test]', id: ticketId }] });

    const updatedSettings = await t.run((ctx) => ctx.db.get(settings._id));
    expect(updatedSettings!.pushTokens).toHaveLength(0); // pruned
  });

  test('a ticket whose receipt comes back with a different error is logged but the token is kept', async () => {
    const { t, pushSender, settings } = await seededWithAPush();
    const ticketId = Object.keys(pushSender.receiptsFor)[0];
    pushSender.receiptsFor[ticketId] = { id: ticketId, ok: false, error: 'MessageTooBig' };

    await t.action(internal.proactive.checkPushReceipts, { settingsId: settings._id, tickets: [{ token: 'ExponentPushToken[test]', id: ticketId }] });

    const updatedSettings = await t.run((ctx) => ctx.db.get(settings._id));
    expect(updatedSettings!.pushTokens).toHaveLength(1); // NOT pruned — not every receipt error means a dead token
  });

  test('control: a clean "ok" receipt leaves the token alone', async () => {
    const { t, pushSender, settings } = await seededWithAPush();
    const ticketId = Object.keys(pushSender.receiptsFor)[0];

    await t.action(internal.proactive.checkPushReceipts, { settingsId: settings._id, tickets: [{ token: 'ExponentPushToken[test]', id: ticketId }] });

    const updatedSettings = await t.run((ctx) => ctx.db.get(settings._id));
    expect(updatedSettings!.pushTokens).toHaveLength(1);
  });

  test('sendPush really does schedule a receipt check (the wiring, not just the standalone action)', async () => {
    const { t } = await seededWithAPush();
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled.some((s) => s.name.includes('checkPushReceipts'))).toBe(true);
  });
});
