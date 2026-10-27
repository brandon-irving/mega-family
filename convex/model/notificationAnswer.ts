// The one place a notification's button answer is actually applied (CONTRACT §4 `notifications.answer`;
// CONTRACT §5 v0.11 `POST /push/answer`). Both the authenticated mutation (convex/notifications.ts) and the
// token-authenticated HTTP route (convex/pushAnswer.ts, for the killed-app background notification task,
// which has no signed-in session) call this — so an answer from the lock screen with the app open and one
// from the background task after it's been killed are recorded, and protected against double-applying,
// exactly the same way.
import type { Via } from '../../shared/domain/enums';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { applyNotificationAnswer } from './notificationEffects';
import { bumpProfileCount } from './proactive';

export type AnswerOutcome = { ok: true; reply: string } | { ok: false; reason: 'unknownButton' };

/** Idempotent: an already-answered notification returns its stored reply and runs no effect again — the
 * one thing that matters for "the backend side must accept answers idempotently" (an app killed right
 * after a tap, a background task retrying, or the same request answered once from the lock screen and
 * once from the thread card). */
export async function answerNotificationCore(ctx: MutationCtx, params: { notification: Doc<'notifications'>; buttonId: string; via: Via; now: number }): Promise<AnswerOutcome> {
  const { notification, buttonId, via, now } = params;
  if (notification.answer) return { ok: true, reply: notification.reply ?? 'Already answered.' };

  const button = notification.buttons.find((b) => b.id === buttonId);
  if (!button) return { ok: false, reason: 'unknownButton' };

  const reply = await applyNotificationAnswer(ctx, { notification, buttonId, now });
  await ctx.db.patch(notification._id, { answer: { buttonId, at: now, via }, reply });
  await bumpProfileCount(ctx, notification.familyId, notification.recipientId, notification.kind, 'answered');
  return { ok: true, reply };
}
