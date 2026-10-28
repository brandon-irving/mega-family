// CONTRACT §4 `rooms.update` — own room only (not HQ).
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { assertKidMayPlace, keepStartingItems, placedItemIds } from './model/store';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

export const update = mutation({
  ...pick(API.rooms.update),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const room = await ctx.db
      .query('rooms')
      .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', viewer.member._id))
      .unique();
    if (!room) fail('NOT_FOUND');
    // GD (invariant 6): a kid places only furniture they own (free, bought, or already in the room).
    if (viewer.member.role === 'kid') {
      await assertKidMayPlace(ctx, viewer.member, viewer.mega, room, args.furniture);
      await keepStartingItems(ctx, viewer.member, placedItemIds(room), await clock.now(ctx, viewer.member.familyId));
    }
    await ctx.db.patch(room._id, { furniture: args.furniture, ...(args.wallColor ? { wallColor: args.wallColor } : {}) });
    return null;
  },
});
