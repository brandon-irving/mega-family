import { v } from 'convex/values';
import { API } from '../shared/domain/api';
import { role } from '../shared/domain/enums';
import { internalQuery, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { tryViewer } from './model/viewer';

export const get = query({
  ...pick(API.me.get),
  handler: async (ctx) => tryViewer(ctx),
});

/** The lightweight viewer an action needs (actions have `ctx.auth` but no `ctx.db` — convex/talk.ts's
 * `talk.transcribe`, which can't use `requireViewer` directly, resolves the signed-in identity to a member
 * through this instead). Not the full `Viewer` (CONTRACT §4 `me.get`) — just enough to run a tool/model call
 * as that member. */
export const requireViewerInternal = internalQuery({
  args: { authSubject: v.string() },
  returns: v.object({ familyId: v.id('families'), memberId: v.id('members'), memberName: v.string(), role, megaId: v.union(v.id('megas'), v.null()) }),
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query('members')
      .withIndex('by_authId', (q) => q.eq('authId', args.authSubject))
      .unique();
    if (!member) fail('NOT_A_MEMBER');
    const mega = await ctx.db
      .query('megas')
      .withIndex('by_family_owner', (q) => q.eq('familyId', member.familyId).eq('ownerId', member._id))
      .unique();
    return { familyId: member.familyId, memberId: member._id, memberName: member.name, role: member.role, megaId: mega?._id ?? null };
  },
});
