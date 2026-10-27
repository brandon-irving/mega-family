// Real effects for `notifications.answer` (PLAN.md -> Proactive engine step 6). Dispatches by the
// notification's `kind` to whichever back-linked row (CONTRACT §2 `notifications.reminderId`/`requestId`,
// G3 additive) the button should act on. `convex/notifications.ts`'s `answer` mutation is the only caller.
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { respondToRequest } from './requestEffects';

/** UX3 (BLOCKER, G3 UX review): a legacy-shaped `request` notification can be missing its own `requestId`
 * back-link (the field is additive/optional — CONTRACT §2 — so any row written before it existed, or
 * written by a path that forgot to set it, has none). The link still exists the OTHER way: every request
 * that produced a notification sets `requests.notificationId` back to it (convex/agent/tools.ts
 * `toolAskMember`, `convex/model/proactive.ts` `deliverCandidateLogic`). Falling back to that reverse link
 * means the button's real effect (adding milk to Groceries, changing the request's status, Today no longer
 * listing it) still runs instead of silently no-oping with "Got it." Bounded scan: `by_family_to` already
 * narrows to this one recipient's own requests (a family-scale collect, same posture as the rest of this
 * backend's "small family" bounded reads). */
async function findRequestForNotification(ctx: MutationCtx, notification: Doc<'notifications'>): Promise<Doc<'requests'> | null> {
  if (notification.requestId) return ctx.db.get(notification.requestId);
  const candidates = await ctx.db
    .query('requests')
    .withIndex('by_family_to', (q) => q.eq('familyId', notification.familyId).eq('toMemberId', notification.recipientId))
    .collect();
  return candidates.find((r) => r.notificationId === notification._id) ?? null;
}

export async function applyNotificationAnswer(ctx: MutationCtx, params: { notification: Doc<'notifications'>; buttonId: string; now: number }): Promise<string> {
  const { notification, buttonId, now } = params;

  switch (notification.kind) {
    case 'request': {
      const request = await findRequestForNotification(ctx, notification);
      if (!request) return 'Got it.';
      return respondToRequest(ctx, { requestId: request._id, accept: buttonId === 'yes', now });
    }

    case 'reminder': {
      if (!notification.reminderId) return 'Got it.';
      const reminder = await ctx.db.get(notification.reminderId);
      if (!reminder) return 'Got it.';
      if (buttonId === 'on_my_way') {
        await ctx.db.patch(reminder._id, { done: true });
        return 'Got it — on my way.';
      }
      if (buttonId === 'snooze_5') {
        await ctx.db.patch(reminder._id, { done: true });
        await ctx.db.insert('reminders', {
          familyId: notification.familyId,
          forMemberId: reminder.forMemberId,
          text: reminder.text,
          dueAt: now + 5 * 60_000,
          eventId: reminder.eventId,
          done: false,
          createdBy: reminder.createdBy,
        });
        return 'Snoozed 5 minutes.';
      }
      return 'Got it.';
    }

    // 'tip' and 'update' ship with no buttons (shared/config/notifications.ts BUTTON_SETS) — `notifications.
    // answer` already refuses an unknown button id before this is ever reached for those kinds.
    default:
      return 'Got it.';
  }
}
