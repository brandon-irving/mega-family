// CONTRACT §4 `hq.room`. Empty `ownerId` = the shared HQ (every family MEGA's "home"); a member id = their
// own room (gated by `sharing.hqActivity` like `megas.status`, except the viewer looking at their own room).
import { API } from '../shared/domain/api';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { megaStatusFor } from './model/megaStatus';
import { requireViewer, sameFamilyMember } from './model/viewer';

function narrate(statuses: { busy: boolean }[]): string {
  const busy = statuses.filter((s) => s.busy).length;
  if (statuses.length === 0) return 'No one here yet.';
  if (busy === 0) return 'Everyone is resting.';
  if (busy === statuses.length) return 'Everyone is busy right now.';
  return `${busy} of ${statuses.length} MEGAs are busy right now.`;
}

export const room = query({
  ...pick(API.hq.room),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (args.ownerId) await sameFamilyMember(ctx, viewer.member.familyId, args.ownerId);

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_family_owner', (q) => (args.ownerId ? q.eq('familyId', viewer.member.familyId).eq('ownerId', args.ownerId) : q.eq('familyId', viewer.member.familyId).eq('ownerId', undefined)))
      .unique();
    if (!room) fail('NOT_FOUND');

    const megaDocs: Doc<'megas'>[] = args.ownerId
      ? await ctx.db
          .query('megas')
          .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', args.ownerId))
          .collect()
      : await ctx.db
          .query('megas')
          .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId))
          .collect();

    const sharingRows = await ctx.db
      .query('sharing')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    const hqActivityByOwner = new Map(sharingRows.map((s) => [s.memberId, s.hqActivity]));

    const megas = [];
    for (const mega of megaDocs) {
      const status = await megaStatusFor(ctx, viewer.member.familyId, viewer.member._id, mega.ownerId, mega, mega.ownerId ? hqActivityByOwner.get(mega.ownerId) : undefined);
      megas.push({ megaId: mega._id, ...status });
    }
    return { room, megas, narration: narrate(megas) };
  },
});
