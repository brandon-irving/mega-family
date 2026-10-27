// Internal functions behind `POST /push/answer` (convex/http.ts; CONTRACT §5 v0.11). The route itself
// lives in http.ts (an httpAction has no `ctx.db`); this file is the thin ctx.db layer it calls through
// `ctx.runQuery`/`ctx.runMutation`, same split as every other action/httpAction in this backend.
import { v } from 'convex/values';
import { LIMITS } from '../shared/config';
import { internalMutation, internalQuery } from './_generated/server';
import { answerNotificationCore } from './model/notificationAnswer';
import { clock } from './ports/clock';

export const loadForToken = internalQuery({
  args: { notificationId: v.id('notifications') },
  returns: v.union(v.object({ recipientId: v.id('members'), now: v.number(), lockedOut: v.boolean() }), v.null()),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    const now = await clock.now(ctx, notification.familyId);
    return { recipientId: notification.recipientId, now, lockedOut: (notification.answerFailedAttempts ?? 0) >= LIMITS.push.maxAnswerTokenAttempts };
  },
});

/** Only counts a *failed token verification* against the cap — an already-answered notification (a valid
 * replay) never gets here, so a legitimate retry can't lock itself out. */
export const recordFailedAttempt = internalMutation({
  args: { notificationId: v.id('notifications') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    await ctx.db.patch(notification._id, { answerFailedAttempts: (notification.answerFailedAttempts ?? 0) + 1 });
    return null;
  },
});

/** The route's one real effect, run only after the caller (convex/http.ts) has already verified the HMAC
 * token for this exact `(notificationId, recipientId)` pair — this mutation itself trusts `notificationId`
 * and `buttonId` the same way `notifications.answer` trusts them once `requireViewer` has already proven
 * who's asking; here the token *is* that proof. `null` means the notification vanished between the token
 * check and this call (vanishingly rare) — the route turns that into the same generic error as everything
 * else, never a different message that would hint at why. */
export const answerViaToken = internalMutation({
  args: { notificationId: v.id('notifications'), buttonId: v.string(), now: v.number() },
  returns: v.union(v.object({ reply: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    const outcome = await answerNotificationCore(ctx, { notification, buttonId: args.buttonId, via: 'push', now: args.now });
    if (!outcome.ok) return null;
    return { reply: outcome.reply };
  },
});
