/// <reference types="vite/client" />
// G1 fix: `today.get`'s `waitingOnYou` listed the seeded milk request twice — once as the request,
// once as its own notification (seed.ts links them: `requests.notificationId` -> the notification that
// pushed it, and that notification's recipient is the same member the request is waiting on). Dedupe
// lives in `today.get` itself (convex/today.ts); this proves it against the real seeded family rather
// than a hand-built fixture.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('today.get: waitingOnYou does not double-list a request and its own notification', () => {
  test('the seeded milk request appears once, not once as a request and again as a notification', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });

    const request = await t.run((ctx) =>
      ctx.db
        .query('requests')
        .withIndex('by_family_to', (q) => q.eq('familyId', familyId).eq('toMemberId', members.admin))
        .first(),
    );
    expect(request, 'fixture sanity: sampleFamily seeds the open milk request to admin').toBeTruthy();
    expect(request!.notificationId, "fixture sanity: the request is linked to the notification that pushed it").toBeDefined();

    const today = await t.withIdentity({ subject: 'sample:admin' }).query(api.today.get, {});

    const requestEntries = today.waitingOnYou.filter((w) => w.kind === 'request' && w.request._id === request!._id);
    expect(requestEntries, 'the request itself must still be listed, exactly once').toHaveLength(1);

    const linkedNotificationEntries = today.waitingOnYou.filter((w) => w.kind === 'notification' && w.notification._id === request!.notificationId);
    expect(linkedNotificationEntries, "the request's own notification must not also be listed separately").toHaveLength(0);
  });
});
