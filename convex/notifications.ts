// CONTRACT §4 `notifications.answer` — day1 stub: records the answer and returns a canned lock-screen
// reply; the button's real tool effect (PLAN.md → Proactive engine step 6) needs the chat tool loop.
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

export const answer = mutation({
  ...pick(API.notifications.answer),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (notification.recipientId !== viewer.member._id) fail('FORBIDDEN');
    const button = notification.buttons.find((b) => b.id === args.buttonId);
    if (!button) fail('VALIDATION', 'unknown button');
    const now = await clock.now(ctx, viewer.member.familyId);
    await ctx.db.patch(notification._id, { answer: { buttonId: args.buttonId, at: now, via: args.via } });
    return { reply: `Got it — ${button.label.toLowerCase()}.` };
  },
});
