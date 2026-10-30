/// <reference types="vite/client" />
// Milestone G3: the proactive engine (PLAN.md -> Proactive engine) — trigger -> candidate -> draft+judge ->
// timing -> deliver -> answer effects. The fake chat model (scripted) and a fake push sender (recorded)
// mean no network call happens; CONTRACT.md's live-model spend budget is untouched by this file.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakePushSender } from './adapters/fakePushSender';
import { __setChatModelForTests, __setPushSenderForTests } from './adapters/registry';
import { SAMPLE_FAMILY } from '../shared/fixtures/sampleFamily';
import { addDays, localDate, zonedInstant } from '../shared/time';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
const TZ = SAMPLE_FAMILY.timezone;

beforeEach(() => {
  vi.useFakeTimers();
  process.env.DEMO_MODE = 'true';
});
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
  __setPushSenderForTests(null);
  delete process.env.DEMO_MODE;
});

async function seeded() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, familyId, members: members as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>> };
}

describe('proactive engine: reminder trigger -> draft+judge -> deliver', () => {
  test('a due reminder judged above the push threshold becomes a real push notification', async () => {
    const { t, familyId, members } = await seeded();
    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.push.register, { token: 'ExponentPushToken[test]', platform: 'ios' });

    const now = Date.now();
    const reminderId = await t.run((ctx) =>
      ctx.db.insert('reminders', { familyId, forMemberId: members.admin, text: 'Take out the recycling', dueAt: now, done: false, createdBy: members.admin }),
    );

    // The same tick may also scan a daily check-in candidate for admin/partner (convex/model/proactive.ts
    // `scanCheckInTriggers`) if "now" happens to be past their check-in time when the suite runs — scoring
    // only the reminder's own seed text high keeps this test's push-count assertions deterministic
    // regardless of time of day.
    __setChatModelForTests(makeFakeChatModel((req) => {
      expect(req.schema).toBeDefined(); // the draft+judge call is structured, not free text
      const userText = req.messages.find((m) => m.role === 'user')?.content ?? '';
      if (userText.includes('Take out the recycling')) return jsonReply({ kind: 'reminder', text: 'Recycling goes out tonight!', score: 0.9, reason: 'due now' });
      return jsonReply({ kind: 'update', text: 'Good morning!', score: 0, reason: 'incidental check-in, not under test' });
    }));
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);

    await admin.mutation(api.clock.jump, { to: now });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const candidates = await t.run((ctx) =>
      ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId).eq('dedupeKey', `reminder:${reminderId}`)).collect(),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].status).toBe('delivered');
    expect(candidates[0].delivery).toBe('push');
    expect(candidates[0].source).toEqual({ kind: 'reminder', reminderId });

    const notifications = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect());
    const created = notifications.find((n) => n.reminderId === reminderId);
    expect(created).toBeDefined();
    expect(created!.body).toBe('Recycling goes out tonight!');
    expect(created!.sentAt).toBeDefined();

    expect(pushSender.sent).toHaveLength(1);
    expect(pushSender.sent[0].data.notificationId).toBe(created!._id);
    expect(pushSender.sent[0].categoryId).toBe('reminder.default');
    expect(pushSender.sent[0].interruptionLevel).toBe('time-sensitive');
  });

  test('dedupe: ticking twice for the same due reminder never creates a second candidate', async () => {
    const { t, familyId, members } = await seeded();
    const now = Date.now();
    const reminderId = await t.run((ctx) => ctx.db.insert('reminders', { familyId, forMemberId: members.admin, text: 'Water the plants', dueAt: now, done: false, createdBy: members.admin }));
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ kind: 'reminder', text: 'Water the plants!', score: 0.9, reason: 'due' })));

    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.clock.jump, { to: now });
    await admin.mutation(api.clock.jump, { to: now + 1000 }); // a second tick, same due reminder still sitting there
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const candidates = await t.run((ctx) =>
      ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId).eq('dedupeKey', `reminder:${reminderId}`)).collect(),
    );
    expect(candidates).toHaveLength(1);
  });

  test('a reminder judged below the widget threshold is dropped: no notification, no push', async () => {
    const { t, familyId, members } = await seeded();
    const now = Date.now();
    await t.run((ctx) => ctx.db.insert('reminders', { familyId, forMemberId: members.admin, text: 'Minor thing', dueAt: now, done: false, createdBy: members.admin }));
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ kind: 'reminder', text: 'Minor thing', score: 0.1, reason: 'not urgent' })));
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);

    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.clock.jump, { to: now });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const candidates = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'dropped')).collect());
    expect(candidates.some((c) => c.reason === 'not urgent')).toBe(true);
    expect(pushSender.sent).toHaveLength(0);
  });

  test('a reminder judged between widget and push thresholds becomes a statement: delivered, no push', async () => {
    const { t, familyId, members } = await seeded();
    const now = Date.now();
    await t.run((ctx) => ctx.db.insert('reminders', { familyId, forMemberId: members.admin, text: 'Could matter later', dueAt: now, done: false, createdBy: members.admin }));
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ kind: 'reminder', text: 'Could matter later', score: 0.45, reason: 'useful but not urgent' })));
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);

    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.clock.jump, { to: now });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const candidates = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'delivered')).collect());
    const statement = candidates.find((c) => c.reason === 'useful but not urgent');
    expect(statement?.delivery).toBe('statement');
    expect(pushSender.sent).toHaveLength(0);
    const notifications = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect());
    expect(notifications.find(n => n.body === 'Could matter later')?.buttons.length).toBeGreaterThan(0); // a statement never becomes a notifications row
  });
});

describe('proactive engine: quiet hours hold a kid reminder until they end', () => {
  test('a reminder due during quiet hours is scheduled past them, not at the raw due time', async () => {
    // Note on what this does and doesn't exercise: `vi.runAllTimers()` (convex-test's documented way to
    // drain scheduled functions under fake timers) advances time exhaustively, so it also fires the
    // `ctx.scheduler.runAt(deliverAt, ...)` callback itself once deliverAt is reached — there's no way,
    // with fake timers, to observe the "held, callback hasn't fired yet" intermediate state the demo's
    // `fireDueScheduledCandidates` sweep exists for (convex/model/proactive.ts). What IS asserted here:
    // quiet hours actually shifted `deliverAt` well past the raw due time, and the push still eventually
    // goes out — the sweep's own correctness (re-checking `deliverAt <= now` and cancelling the original
    // scheduled call) is covered by reading its implementation directly, not re-derivable through this test.
    const { t, familyId, members } = await seeded();
    await t.withIdentity({ subject: 'sample:twin1' }).mutation(api.push.register, { token: 'ExponentPushToken[kid]', platform: 'ios' });
    const today = localDate(Date.now(), TZ);
    const dueAt = zonedInstant(today, 21 * 60, TZ); // 9pm local, inside the kid default quiet hours (20:30-07:00)
    const reminderId = await t.run((ctx) => ctx.db.insert('reminders', { familyId, forMemberId: members.twin1, text: 'Pack your bag', dueAt, done: false, createdBy: members.admin }));
    // Same determinism note as the push-threshold test above: score only this reminder's own seed text
    // high, so an incidental admin/partner daily check-in candidate never adds an unexpected push.
    __setChatModelForTests(makeFakeChatModel((req) => {
      const userText = req.messages.find((m) => m.role === 'user')?.content ?? '';
      if (userText.includes('Pack your bag')) return jsonReply({ kind: 'reminder', text: 'Pack your bag for tomorrow!', score: 0.9, reason: 'due' });
      return jsonReply({ kind: 'update', text: 'Good morning!', score: 0, reason: 'incidental check-in, not under test' });
    }));
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);

    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.clock.jump, { to: dueAt });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const candidate = (
      await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId).eq('dedupeKey', `reminder:${reminderId}`)).collect())
    )[0];
    expect(candidate.deliverAt).toBeGreaterThan(dueAt); // quiet hours pushed it well past the raw due time
    expect(candidate.status).toBe('delivered'); // and it did eventually go out
    // GD: the same jump also delivers GD cards (routines, chores); count only this reminder's push.
    expect(pushSender.sent.filter((m) => m.body.includes('Pack your bag'))).toHaveLength(1);
  });
});

describe('proactive engine: MEGA-to-MEGA requests (ask_member)', () => {
  async function askMember(t: TestConvex<typeof schema>, familyId: Id<'families'>, members: Record<string, Id<'members'>>, onAccept?: { tool: 'lists_add'; listName: string; text: string }) {
    const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner)).unique()))!;
    const mega = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner)).unique()))!;
    return t.mutation(internal.agent.tools.execute, {
      familyId,
      memberId: members.partner,
      megaId: mega._id,
      threadId: thread._id,
      name: 'ask_member',
      argumentsJson: JSON.stringify({ toMemberId: members.admin, text: 'Can you grab oat milk?', onAccept }),
    });
  }

  test('creates a request candidate that pushes immediately with NO draft/judge model call', async () => {
    const { t, familyId, members } = await seeded();
    await t.withIdentity({ subject: 'sample:admin' }).mutation(api.push.register, { token: 'ExponentPushToken[test]', platform: 'ios' });
    let modelCalls = 0;
    __setChatModelForTests(makeFakeChatModel(() => {
      modelCalls++;
      return jsonReply({ kind: 'request', text: 'should never be called', score: 1, reason: '' });
    }));
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);

    const result = await askMember(t, familyId, members, { tool: 'lists_add', listName: 'Groceries', text: 'Oat milk' });
    expect(result.ok).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(modelCalls).toBe(0); // the asking member already wrote the text — no draft/judge call needed
    const request = (await t.run((ctx) => ctx.db.query('requests').withIndex('by_family_to', (q) => q.eq('familyId', familyId).eq('toMemberId', members.admin)).collect())).find(
      (r) => r.text === 'Can you grab oat milk?',
    )!;
    expect(request.onAccept).toEqual({ tool: 'lists_add', listName: 'Groceries', text: 'Oat milk' });
    expect(request.notificationId).toBeDefined();
    expect(pushSender.sent).toHaveLength(1);
  });

  test('"yes" tells the requester and adds the item; answering again is idempotent (no double add)', async () => {
    const { t, familyId, members } = await seeded();
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ operations: [] })));
    await askMember(t, familyId, members, { tool: 'lists_add', listName: 'Groceries', text: 'Oat milk' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const request = (await t.run((ctx) => ctx.db.query('requests').withIndex('by_family_to', (q) => q.eq('familyId', familyId).eq('toMemberId', members.admin)).collect())).find(
      (r) => r.text === 'Can you grab oat milk?',
    )!;
    const notification = (await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect())).find(
      (n) => n.requestId === request._id,
    )!;

    const admin = t.withIdentity({ subject: 'sample:admin' });
    const first = await admin.mutation(api.notifications.answer, { notificationId: notification._id, buttonId: 'yes', via: 'push' });
    expect(first.reply).toMatch(/you'll handle it/i);

    const second = await admin.mutation(api.notifications.answer, { notificationId: notification._id, buttonId: 'yes', via: 'push' });
    expect(second.reply).toBe(first.reply); // stored reply replayed, not recomputed

    const list = (await t.run((ctx) => ctx.db.query('lists').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect())).find((l) => l.name === 'Groceries')!;
    const items = await t.run((ctx) => ctx.db.query('listItems').withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', list._id)).collect());
    expect(items.filter((i) => i.text === 'Oat milk')).toHaveLength(1); // not added twice

    const requested = await t.run((ctx) => ctx.db.get(request._id));
    expect(requested!.status).toBe('accepted');

    const partnerThread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner)).unique()))!;
    const partnerMessages = await t.run((ctx) =>
      ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', partnerThread._id)).collect(),
    );
    expect(partnerMessages.some((m) => m.body.type === 'text' && /said yes/i.test(m.body.text))).toBe(true);
  });

  test('cross-path idempotency: requests.respond (chat card) then notifications.answer (push) for the same request never double-applies', async () => {
    const { t, familyId, members } = await seeded();
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ operations: [] })));
    await askMember(t, familyId, members, { tool: 'lists_add', listName: 'Groceries', text: 'Oat milk' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const request = (await t.run((ctx) => ctx.db.query('requests').withIndex('by_family_to', (q) => q.eq('familyId', familyId).eq('toMemberId', members.admin)).collect())).find(
      (r) => r.text === 'Can you grab oat milk?',
    )!;
    const notification = (await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect())).find(
      (n) => n.requestId === request._id,
    )!;

    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.requests.respond, { requestId: request._id, accept: true }); // answered via the thread card first
    const viaPush = await admin.mutation(api.notifications.answer, { notificationId: notification._id, buttonId: 'yes', via: 'push' }); // then via the push button
    expect(viaPush.reply).toMatch(/already/i);

    const list = (await t.run((ctx) => ctx.db.query('lists').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect())).find((l) => l.name === 'Groceries')!;
    const items = await t.run((ctx) => ctx.db.query('listItems').withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', list._id)).collect());
    expect(items.filter((i) => i.text === 'Oat milk')).toHaveLength(1);
  });
});

describe('proactive engine: reminder answer effects', () => {
  test('snooze_5 marks the original reminder done and creates a new one 5 minutes later', async () => {
    const { t, familyId, members } = await seeded();
    const notification = (
      await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.twin2)).collect())
    )[0]; // the seed's held kid reminder (SAMPLE_FAMILY.heldReminder.for === 'twin2')
    expect(notification.reminderId).toBeDefined();

    // released by a clock jump past its heldUntil, same as the UX flow
    const releasedAt = notification.heldUntil! + 1000;
    await t.withIdentity({ subject: 'sample:admin' }).mutation(api.clock.jump, { to: releasedAt });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const kid = t.withIdentity({ subject: 'sample:twin2' });
    const result = await kid.mutation(api.notifications.answer, { notificationId: notification._id, buttonId: 'snooze_5', via: 'push' });
    expect(result.reply).toMatch(/snoozed/i);

    const originalReminder = await t.run((ctx) => ctx.db.get(notification.reminderId!));
    expect(originalReminder!.done).toBe(true);
    const allReminders = await t.run((ctx) => ctx.db.query('reminders').withIndex('by_family_member_due', (q) => q.eq('familyId', familyId).eq('forMemberId', members.twin2)).collect());
    const snoozed = allReminders.find((r) => r._id !== notification.reminderId && r.text === originalReminder!.text);
    expect(snoozed).toBeDefined();
    expect(snoozed!.done).toBe(false);
    // dueAt is 5 minutes from *answer time* (releasedAt, under the fake clock — plus whatever small,
    // real drift the scheduler/transaction machinery adds between calls), not from the original
    // (already-past) dueAt.
    expect(snoozed!.dueAt).toBeGreaterThanOrEqual(releasedAt + 5 * 60_000);
    expect(snoozed!.dueAt).toBeLessThan(releasedAt + 5 * 60_000 + 1000);
  });
});

describe('proactive engine: 👍/👎 feeds profiles.proactive', () => {
  test('reacting to a notification-mirrored message bumps the right kind/field', async () => {
    const { t, familyId, members } = await seeded();
    const notification = (
      await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect())
    ).find((n) => n.kind === 'request')!; // the seed's milk request

    const before = (await t.run((ctx) => ctx.db.query('profiles').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', members.admin)).unique()))!;
    const message = (await t.run((ctx) => ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId)).collect())).find(
      (m) => m.fromNotificationId === notification._id,
    )!;

    await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.react, { messageId: message._id, reaction: 'up' });

    const after = (await t.run((ctx) => ctx.db.query('profiles').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', members.admin)).unique()))!;
    expect(after.proactive.request.up).toBe(before.proactive.request.up + 1);
  });
});

describe('proactive engine: G6 #6a — clock.jump must deliver a candidate finalized by an async action chain', () => {
  test('a bedtime card whose candidate is only finalized once routines.prepBedtime’s model call returns (convex/routines.ts) is still delivered during the SAME jump, not left "scheduled" waiting on a real-world scheduler callback', async () => {
    const { t, familyId, members } = await seeded();
    const admin = t.withIdentity({ subject: 'sample:admin' });

    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema?.name === 'bedtimePrep') {
          const seen = req.messages.map((x) => x.content).join('\n');
          const id = /\[([^\]]+)\] Soccer practice/.exec(seen)?.[1] ?? '';
          return jsonReply({ items: [{ eventId: id, label: 'Cleats', detail: '' }] });
        }
        return jsonReply({ kind: 'update', title: '', text: '', score: 0, reason: '' }); // incidental check-in draft, not under test
      }),
    );

    // Wednesday 7:50 PM NY: tomorrow (Thursday) is the sample family's seeded soccer practice, so the
    // bedtime run needs routines.ts's prepBedtime action (a real model call) before its card candidate
    // exists at all — unlike a plain reminder/check-in candidate, this one is only finalized well after
    // `clock.jump`'s own `tickFamilyLogic` mutation has already returned (convex/model/gdTick.ts ->
    // scanRoutineTriggers schedules `prepBedtime` via `ctx.scheduler.runAfter(0, ...)`, an action).
    await admin.mutation(api.clock.jump, { to: Date.parse('2026-10-28T23:50:00Z') });

    // Advance just enough (real demo sessions get this for free, instantly) for that one `runAfter(0)` async
    // chain to run to completion — NOT all the way to the resulting push candidate's own `deliverAt` schedule,
    // which sits days ahead on the real/fake clock the same way it would sit days ahead of a live demo's
    // actual wall-clock time. `finishAllScheduledFunctions(vi.runAllTimers)` would fast-forward straight past
    // that gap (it keeps advancing until the queue is empty, however far out), which is exactly why the
    // existing "bedtime prep comes from tomorrow's household events" test (convex/gdKids.test.ts) never
    // caught this: it never checked delivery, only the drafted content.
    await vi.advanceTimersByTimeAsync(50);
    await t.finishInProgressScheduledFunctions();

    // CONTRACT §4 / convex/clock.ts: "clock.jump drives the same tick ... releasing held notifications,
    // firing any candidate whose deliverAt the jump leapt past". A candidate stuck at 'scheduled' here means
    // that promise broke for this candidate: its own `ctx.scheduler.runAt(deliverAt, deliverCandidate)`
    // callback is scheduled for a REAL future instant (the family clock's offset ahead of actual wall time),
    // which nothing in this same session forces — the exact gap the Oct 29 web walkthrough hit
    // (docs/gates/G6-walkthrough.md #6): the push candidate stayed "scheduled" and never reached the thread.
    const stuck = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'scheduled')).collect());
    expect(stuck.filter((c) => c.source?.kind === 'routine')).toHaveLength(0);

    const delivered = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'delivered')).collect());
    expect(delivered.some((c) => c.source?.kind === 'routine')).toBe(true);

    // The card actually landed in the kid's own thread (not just a database row) — this is the "appeared as
    // a chat card in the session" the walkthrough found missing.
    const twin1Thread = await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.twin1)).unique());
    const cards = await t.run((ctx) => ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', twin1Thread!._id)).collect());
    const bedtimeCard = cards.find((msg) => msg.body.type === 'card' && msg.body.card.kind === 'routine');
    expect(bedtimeCard).toBeDefined();
  });
});
