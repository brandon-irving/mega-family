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

// S4 (LOW, G3 security review): unlike `POST /push/answer` (convex/pushAnswer.ts), this mutation needs no
// brute-force lockout of its own. `pushAnswer`'s guard protects a SECRET the caller must present
// (`answerToken`, an HMAC the caller doesn't already know and could try to guess/forge) — the lockout
// exists because repeated wrong guesses are the attack. Here, `requireViewer` has already independently
// proven who's calling (a signed-in session, not a token derived from this notification), and `buttonId`
// is never a secret to guess — it's one of a handful of public, fixed strings (`'yes'`/`'on_my_way'`/…)
// that do nothing without also being this specific notification's own recipient. There is nothing to brute
// force here, so no lockout is added.
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
