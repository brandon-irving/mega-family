/// <reference types="vite/client" />
// G3 security/UX review:
// - C6 (MEDIUM) / UX7 (HIGH): a kid-targeted draft runs through the SAME independent concern gate a
//   memory save does before it's ever scheduled — a concerning mattersTo-sourced draft about/involving a
//   kid must never reach that kid's own notification tray.
// - UX7 (voice): the draft+judge prompt addresses the recipient by `profiles.callMe`, not whatever label
//   happens to be on the roster.
// - UX6 (HIGH): the notification's own `title` is the item's headline, sanitized, with a sensible fallback.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakePushSender } from './adapters/fakePushSender';
import { __setChatModelForTests, __setPushSenderForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { buildDraftJudgePrompt, insertCandidateIfNew, loadDraftContextFor } from './model/proactive';
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

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, familyId, members: members as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>> };
}

describe('C6/UX7: a kid-targeted draft passes the same independent concern gate as a memory save', () => {
  test('a concerning mattersTo-sourced draft about a kid never reaches that kid as a notification', async () => {
    const { t, familyId, members } = await seeded();
    // GD: the cross-member "matters to" trigger is gone (explicit share only), but the concern gate still
    // guards every draft a kid can receive. Queue the same candidate that trigger used to make, directly.
    const eventId = await t.run((ctx) =>
      ctx.db.insert('familyEvents', { familyId, at: Date.now(), type: 'said', payload: {}, processed: { memory: true, profiler: true, triggers: true } }),
    );
    const queuedId = await t.run((ctx) =>
      insertCandidateIfNew(ctx, {
        familyId,
        recipientId: members.twin1,
        kind: 'tip',
        dedupeKey: `mattersTo:${eventId}`,
        draftText: 'Twin 1 got suspended from school today and seems really upset about it.',
        window: { from: Date.now(), to: Date.now() + 3_600_000 },
        source: { kind: 'mattersTo', fromMemberId: members.admin, familyEventId: eventId },
      }),
    );

    // The draft+judge model itself isn't asked to screen for concern — it just writes a tip. The
    // INDEPENDENT classifier (convex/agent/concernClassifier.ts) is what must catch this.
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema?.name === 'concernClassifier') return jsonReply({ category: 'school_trouble', confidence: 0.9 });
        return jsonReply({ kind: 'tip', title: 'About your brother', text: 'Twin 1 got suspended from school today.', score: 0.8, reason: 'relayed' });
      }),
    );
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);

    await t.action(internal.proactive.processCandidate, { candidateId: queuedId! });
    await t.finishAllScheduledFunctions(vi.runAllTimers);


    const candidate = (await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId).eq('dedupeKey', `mattersTo:${eventId}`)).collect()))[0];
    expect(candidate.status).toBe('dropped');
    expect(candidate.reason).toMatch(/school_trouble/i);

    const notifications = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.twin1)).collect());
    // GD: the same sweep also delivers the kid's own routine/chore cards; only this mattersTo draft is under test.
    const fromThisDraft = notifications.filter((n) => n.candidateId === candidate._id);
    expect(fromThisDraft).toHaveLength(0); // never delivered to the kid
    expect(pushSender.sent.filter((m) => fromThisDraft.some((n) => n._id === m.data.notificationId))).toHaveLength(0);

    // and the drop is logged, same posture as a dropped memory proposal
    const logged = (await t.run((ctx) => ctx.db.query('familyEvents').withIndex('by_family_at', (q) => q.eq('familyId', familyId)).collect())).find(
      (r) => (r.payload as any)?.droppedConcerningMemory,
    );
    expect(logged).toBeDefined();
  });

  test("control: an ordinary (non-concerning) mattersTo draft targeting a kid is NOT caught by the concern gate (it's dropped later only because tip/update kinds aren't pushed to kids at all — shared/config/notifications.ts kidsGetIt — a separate, pre-existing policy)", async () => {
    const { t, familyId, members } = await seeded();
    // GD: the cross-member "matters to" trigger is gone (explicit share only), but the concern gate still
    // guards every draft a kid can receive. Queue the same candidate that trigger used to make, directly.
    const eventId = await t.run((ctx) =>
      ctx.db.insert('familyEvents', { familyId, at: Date.now(), type: 'said', payload: {}, processed: { memory: true, profiler: true, triggers: true } }),
    );
    const queuedId = await t.run((ctx) =>
      insertCandidateIfNew(ctx, {
        familyId,
        recipientId: members.twin1,
        kind: 'tip',
        dedupeKey: `mattersTo:${eventId}`,
        draftText: 'Soccer practice moved to 5pm today.',
        window: { from: Date.now(), to: Date.now() + 3_600_000 },
        source: { kind: 'mattersTo', fromMemberId: members.admin, familyEventId: eventId },
      }),
    );

    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema?.name === 'concernClassifier') return jsonReply({ category: 'ok', confidence: 0.9 });
        return jsonReply({ kind: 'update', title: 'Practice moved', text: 'Soccer practice moved to 5pm today.', score: 0.9, reason: 'useful' });
      }),
    );

    await t.action(internal.proactive.processCandidate, { candidateId: queuedId! });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const candidate = (await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId).eq('dedupeKey', `mattersTo:${eventId}`)).collect()))[0];
    // still resolved (dropped by the pre-existing kidsGetIt policy, since no kid-eligible kind applies) —
    // but with the JUDGE's own stated reason, never a concern-gate reason, proving the gate let it through.
    expect(candidate.reason).toBe('useful');
    const logged = (await t.run((ctx) => ctx.db.query('familyEvents').withIndex('by_family_at', (q) => q.eq('familyId', familyId)).collect())).find(
      (r) => (r.payload as any)?.droppedConcerningMemory,
    );
    expect(logged).toBeUndefined();
  });
});

describe('UX7 (voice): the draft+judge prompt addresses the recipient by profiles.callMe', () => {
  test('buildDraftJudgePrompt uses callMe, not the roster label, once callMe differs', async () => {
    const { t, familyId, members } = await seeded();
    const profile = (await t.run((ctx) => ctx.db.query('profiles').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', members.twin2)).unique()))!;
    await t.run((ctx) => ctx.db.patch(profile._id, { callMe: 'Bug' }));

    const reminderId = await t.run((ctx) => ctx.db.insert('reminders', { familyId, forMemberId: members.twin2, text: 'Return the library book', dueAt: Date.now(), done: false, createdBy: members.admin }));
    const candidateId = await t.run((ctx) =>
      ctx.db.insert('candidates', {
        familyId,
        recipientId: members.twin2,
        kind: 'reminder',
        dedupeKey: `voice-test:${reminderId}`,
        draft: { text: 'Return the library book', buttons: 'reminder.default' },
        window: { from: Date.now(), to: Date.now() + 60_000 },
        status: 'new',
        source: { kind: 'reminder', reminderId },
      }),
    );

    const ctxData = await t.run((ctx) => loadDraftContextFor(ctx, candidateId));
    expect(ctxData!.recipientName).toBe('Bug'); // callMe, never the roster label "Twin 2"
    const { system, user } = buildDraftJudgePrompt(ctxData!);
    expect(system).toContain('Bug');
    expect(system).not.toMatch(/\bTwin 2\b/); // never addressed as the generic sample label
    expect(user).toContain('Return the library book'); // still fenced as untrusted data, but present
  });
});

describe('UX6: the notification title is the item\'s own headline, not the MEGA\'s name', () => {
  test('a reminder notification gets a real headline title, with a sensible fallback when the model omits one', async () => {
    const { t, familyId, members } = await seeded();
    const now = await t.run((ctx) => clock.now(ctx, familyId));
    const reminderId = await t.run((ctx) => ctx.db.insert('reminders', { familyId, forMemberId: members.admin, text: 'Soccer pickup in 10 minutes', dueAt: now, done: false, createdBy: members.admin }));
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ kind: 'reminder', text: 'Time to head out!', score: 0.9, reason: 'due' }))); // model omits "title"
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);
    await t.withIdentity({ subject: 'sample:admin' }).mutation(api.push.register, { token: 'ExponentPushToken[test]', platform: 'ios' });

    await t.mutation(internal.proactive.tickFamily, { familyId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const notification = (await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect())).find(
      (n) => n.reminderId === reminderId,
    )!;
    expect(notification.title).toBe('Soccer pickup in 10 minutes'); // fell back to the reminder's own text
    expect(notification.title).not.toMatch(/^Teal$/); // never just the MEGA's name
  });
});
