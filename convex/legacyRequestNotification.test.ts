/// <reference types="vite/client" />
// G3 UX review UX3 (BLOCKER): when a `request`-kind notification is missing its own `requestId` back-link
// (a legacy-shaped row — the field is additive/optional), `applyNotificationAnswer` must fall back to the
// request linked the OTHER way (`requests.notificationId`) so the button's real effect still runs — milk
// gets added, the request's status changes, and Today stops listing it — instead of silently returning
// "Got it." with nothing actually happening.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

describe('UX3: a legacy-shaped request notification (no requestId) still runs its real effect', () => {
  test('notifications.answer falls back to requests.notificationId and runs the onAccept effect', async () => {
    const t = convexTest(schema, modules);
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ operations: [] })));
    const { familyId, members: rawMembers } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const members = rawMembers as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>>;

    // The seed's own milk request/notification already has `requestId` set correctly — simulate the
    // LEGACY shape (a row written before that field existed) by stripping it, while keeping the reverse
    // link (`requests.notificationId`) that every real request-producing path already sets.
    const notification = (await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect())).find(
      (n) => n.kind === 'request',
    )!;
    const request = (await t.run((ctx) => ctx.db.get(notification.requestId!)))!;
    await t.run((ctx) => ctx.db.patch(notification._id, { requestId: undefined }));

    const admin = t.withIdentity({ subject: 'sample:admin' });
    const result = await admin.mutation(api.notifications.answer, { notificationId: notification._id, buttonId: 'yes', via: 'push' });
    expect(result.reply).toMatch(/you'll handle it/i); // the real effect ran, not a bare "Got it."

    const updatedRequest = await t.run((ctx) => ctx.db.get(request._id));
    expect(updatedRequest!.status).toBe('accepted'); // the request's own status changed

    const list = (await t.run((ctx) => ctx.db.query('lists').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect())).find((l) => l.name === 'Groceries')!;
    const items = await t.run((ctx) => ctx.db.query('listItems').withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', list._id)).collect());
    expect(items.some((i) => i.text === 'Milk')).toBe(true); // milk really got added
  });
});
