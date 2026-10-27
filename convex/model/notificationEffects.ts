// Real effects for `notifications.answer` (PLAN.md -> Proactive engine step 6). Dispatches by the
// notification's `kind` to whichever back-linked row (CONTRACT §2 `notifications.reminderId`/`requestId`,
// G3 additive) the button should act on. `convex/notifications.ts`'s `answer` mutation is the only caller.
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { respondToRequest } from './requestEffects';

export async function applyNotificationAnswer(ctx: MutationCtx, params: { notification: Doc<'notifications'>; buttonId: string; now: number }): Promise<string> {
  const { notification, buttonId, now } = params;

  switch (notification.kind) {
    case 'request': {
      if (!notification.requestId) return 'Got it.';
      return respondToRequest(ctx, { requestId: notification.requestId, accept: buttonId === 'yes', now });
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
