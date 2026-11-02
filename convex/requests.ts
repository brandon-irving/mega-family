export { retry as syncCalendar } from './participantCalendar';
// CONTRACT §4 `requests.respond` — G3: real effects (PLAN.md → Proactive engine step 6: "tell the
// requester + add milk to Groceries"), through the same dispatcher `notifications.answer` uses
// (convex/model/requestEffects.ts) — so an answer from the thread card and one from a push/lock-screen
// button are recorded the same way (CONTRACT §5).
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { respondToRequest } from './model/requestEffects';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

export const respond = mutation({
  ...pick(API.requests.respond),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (request.toMemberId !== viewer.member._id) fail('FORBIDDEN');
    // S2 (HIGH, G3 security review): checked independently of `toolAskMember`'s refusal to TARGET a kid
    // with an ask (convex/agent/tools.ts) — this is the server boundary a kid could still hit directly
    // (an old request from before that fix, a bypassed client, a future caller of this mutation), so it
    // can't rely on the tool-level refusal alone. A kid is never a valid request responder.
    // The shared responder enforces the narrow authorized-teen scheduling exception on both surfaces.
    const now = await clock.now(ctx, viewer.member.familyId);
    await respondToRequest(ctx, { requestId: request._id, accept: args.accept, now });
    return null;
  },
});

// A legacy request card yields to its detailed notification only when that message exists.
export const get = query({
  ...pick(API.requests.get),
  handler: async (ctx, { requestId }) => {
    const viewer = await requireViewer(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.familyId !== viewer.member.familyId || request.toMemberId !== viewer.member._id) return null;
    const notification = request.notificationId ? await ctx.db.get(request.notificationId) : null;
    const message = notification?.messageId ? await ctx.db.get(notification.messageId) : null;
    const mirrored = message?.body.type === 'card' && message.body.card.kind === 'notification' && message.body.card.notificationId === notification?._id;
    return { text: request.text, status: request.status, mirrored, calendarOperation: request.scheduling?.calendarOperation };
  },
});
