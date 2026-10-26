// CONTRACT §4 `requests.respond` — day1 stub: updates status; the "tell Coral / add milk to the list"
// side effects described in PLAN.md → Proactive engine need the chat tool loop, which isn't wired yet.
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer } from './model/viewer';

export const respond = mutation({
  ...pick(API.requests.respond),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (request.toMemberId !== viewer.member._id) fail('FORBIDDEN');
    await ctx.db.patch(request._id, { status: args.accept ? 'accepted' : 'declined' });
    return null;
  },
});
