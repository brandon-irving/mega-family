// CONTRACT §4 `requests.respond` — G3: real effects (PLAN.md → Proactive engine step 6: "tell the
// requester + add milk to Groceries"), through the same dispatcher `notifications.answer` uses
// (convex/model/requestEffects.ts) — so an answer from the thread card and one from a push/lock-screen
// button are recorded the same way (CONTRACT §5).
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
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
    const now = await clock.now(ctx, viewer.member.familyId);
    await respondToRequest(ctx, { requestId: request._id, accept: args.accept, now });
    return null;
  },
});
