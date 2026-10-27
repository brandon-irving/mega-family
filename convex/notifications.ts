// CONTRACT §4 `notifications.answer` — G3: real effects (PLAN.md → Proactive engine step 6), idempotent,
// through the same core both this mutation and `POST /push/answer` (convex/pushAnswer.ts) call
// (convex/model/notificationAnswer.ts).
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { answerNotificationCore } from './model/notificationAnswer';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

/** CONTRACT §4 `notifications.get` (v0.6, pending approval) — G1 fix: the chat thread's `{ kind:
 * 'notification' }` card needs this to render real content instead of the word "Notification". Same
 * recipient-only rule as `notifications.answer`. */
export const get = query({
  ...pick(API.notifications.get),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (notification.recipientId !== viewer.member._id) fail('FORBIDDEN');
    return notification;
  },
});

export const answer = mutation({
  ...pick(API.notifications.answer),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (notification.recipientId !== viewer.member._id) fail('FORBIDDEN');
    const now = await clock.now(ctx, viewer.member.familyId);
    const outcome = await answerNotificationCore(ctx, { notification, buttonId: args.buttonId, via: args.via, now });
    if (!outcome.ok) fail('VALIDATION', 'unknown button');
    return { reply: outcome.reply };
  },
});
