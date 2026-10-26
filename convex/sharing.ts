// CONTRACT §4 `sharing.get` / `.set`. Kids have no `sharing` row (seed.ts never creates one for them —
// their equivalent is `kidControls`, parent-set), so `.get` reports `null` for them rather than inventing
// defaults, and `.set` refuses kids outright so that invariant can never be bypassed by calling it.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { fail } from './model/errors';
import { pick } from './model/define';
import { requireViewer } from './model/viewer';

export const get = query({
  ...pick(API.sharing.get),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const row = await ctx.db
      .query('sharing')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', viewer.member._id))
      .unique();
    return row ? { schedule: row.schedule, lists: row.lists, hqActivity: row.hqActivity } : null;
  },
});

export const set = mutation({
  ...pick(API.sharing.set),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN', "kids don't have sharing settings — see kidControls");
    const row = await ctx.db
      .query('sharing')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', viewer.member._id))
      .unique();
    if (row) {
      const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      await ctx.db.patch(row._id, patch);
    } else {
      await ctx.db.insert('sharing', {
        familyId: viewer.member.familyId,
        memberId: viewer.member._id,
        schedule: args.schedule ?? 'family',
        lists: args.lists ?? 'family',
        hqActivity: args.hqActivity ?? 'family',
      });
    }
    return null;
  },
});
