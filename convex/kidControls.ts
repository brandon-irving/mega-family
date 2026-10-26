// CONTRACT §4 `kidControls.set`: parents only.
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer, sameFamilyMember } from './model/viewer';

export const set = mutation({
  ...pick(API.kidControls.set),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const target = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    if (target.role !== 'kid' || !viewer.isParentOf.includes(target._id)) fail('FORBIDDEN');
    const row = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', target._id))
      .unique();
    if (!row) fail('NOT_FOUND');
    const patch = Object.fromEntries(Object.entries(args.patch).filter(([, v]) => v !== undefined));
    await ctx.db.patch(row._id, patch);
    return null;
  },
});
