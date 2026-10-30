/// <reference types="vite/client" />
// G3 correctness review C1 (BLOCKER): the daily push cap must be enforced at the point of actual
// commitment (`deliverCandidateLogic`, right before the `notifications` insert) — not only back at
// `finalizeCandidateLogic` time. Two candidates finalized "simultaneously" (before either has actually
// been delivered) could both see "0 sent so far" and both decide `delivery: 'push'`; only a recheck right
// before the write that commits a push closes that race.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, familyId, members: members as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>> };
}

describe('C1: the daily push cap is re-checked at the point of commitment, not just at finalize time', () => {
  test('dailyCap 1, two candidates both already "scheduled" to push at the same instant -> exactly one real push', async () => {
    const { t, familyId, members } = await seeded();
    const settings = (await t.run((ctx) => ctx.db.query('settings').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', members.admin)).unique()))!;
    await t.run((ctx) => ctx.db.patch(settings._id, { notify: { ...settings.notify, dailyCap: 1 } }));
    // Start the admin's "sent today" count at a clean zero — the seed itself already sent the admin one
    // push today (the milk request), which would otherwise eat the cap=1 budget before this test's own
    // two candidates get a chance to race.
    const alreadySent = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect());
    for (const n of alreadySent) if (n.sentAt !== undefined) await t.run((ctx) => ctx.db.delete(n._id));

    const now = Date.now();
    // Two candidates, BOTH already decided (by an earlier `finalizeCandidateLogic` call, before either was
    // actually delivered) to push at the exact same instant — the race this fix closes. Inserted directly
    // in `status: 'scheduled'` so `deliverCandidateLogic` is the only thing left to run for each, exactly
    // the state two "simultaneous" real pushes would be in going into the delivery step.
    const candidateIds: Id<'candidates'>[] = [];
    for (let i = 0; i < 2; i++) {
      const id = await t.run((ctx) =>
        ctx.db.insert('candidates', {
          familyId,
          recipientId: members.admin,
          kind: 'reminder',
          dedupeKey: `race-test:${i}`,
          draft: { text: `Reminder ${i}`, title: `Reminder ${i}`, buttons: 'reminder.default' },
          score: 0.9,
          reason: 'test',
          delivery: 'push',
          window: { from: now, to: now + 60_000 },
          deliverAt: now,
          status: 'scheduled',
        }),
      );
      candidateIds.push(id);
    }

    // Both delivered within the same tick, in sequence — exactly how `fireDueScheduledCandidates` (or two
    // real `ctx.scheduler.runAt` callbacks landing the same moment) would process them.
    for (const id of candidateIds) await t.mutation(internal.proactive.deliverCandidate, { candidateId: id });

    const delivered = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'delivered')).collect());
    const ours = delivered.filter((c) => c.dedupeKey.startsWith('race-test:'));
    expect(ours).toHaveLength(2); // both get resolved (not dropped) ...
    expect(ours.filter((c) => c.delivery === 'push')).toHaveLength(1); // ... but only one actually pushes
    expect(ours.filter((c) => c.delivery === 'statement')).toHaveLength(1); // the other is demoted, not silently lost

    const notifications = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect());
    const ourNotifications = notifications.filter((n) => n.candidateId && candidateIds.includes(n.candidateId));
    expect(ourNotifications).toHaveLength(2); // The demoted item remains answerable in Today, without a second push.
  });
});
