/// <reference types="vite/client" />
// G3 correctness review C2 (BLOCKER): seed, jump the clock past the end of the kid's quiet hours, run the
// scheduled functions -> exactly one notification for the seed's held reminder (SAMPLE_FAMILY.heldReminder,
// "Return the library book", for twin2). Before this fix, the seed's hand-made orphan notification (no
// candidate behind it) and `scanReminderTriggers`'s own fresh "discovery" of the still-due reminder once
// quiet hours ended produced TWO notifications for the same reminder.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakePushSender } from './adapters/fakePushSender';
import { __setChatModelForTests, __setPushSenderForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

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

describe('C2: the seed double-notify — a held kid reminder yields exactly one notification', () => {
  test('seed, jump the clock past the end of quiet hours, run scheduled functions -> exactly one notification', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members: rawMembers } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const members = rawMembers as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>>;
    await t.withIdentity({ subject: 'sample:twin2' }).mutation(api.push.register, { token: 'ExponentPushToken[kid]', platform: 'ios' });

    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ kind: 'reminder', title: 'Library book', text: 'Return the library book!', score: 0.9, reason: 'due' })));
    const pushSender = makeFakePushSender();
    __setPushSenderForTests(pushSender);

    const heldBefore = (await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.twin2)).collect()))[0];
    expect(heldBefore).toBeDefined();
    expect(heldBefore.sentAt).toBeUndefined(); // genuinely held, not yet sent
    expect(heldBefore.heldUntil).toBeDefined();

    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.clock.jump, { to: heldBefore.heldUntil! + 1000 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const notificationsAfter = await t.run((ctx) =>
      ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.twin2)).collect(),
    );
    expect(notificationsAfter).toHaveLength(1); // exactly one — not two
    expect(notificationsAfter[0]._id).toBe(heldBefore._id); // the SAME row, released — not a brand-new one
    expect(notificationsAfter[0].sentAt).toBeDefined();

    // and the trigger scanner really did consider it (not just happen to not fire): still only one
    // candidate exists for this reminder.
    const candidates = await t.run((ctx) =>
      ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId).eq('dedupeKey', `reminder:${heldBefore.reminderId}`)).collect(),
    );
    expect(candidates).toHaveLength(1);
  });
});
