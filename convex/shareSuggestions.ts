// CONTRACT §4 `shareSuggestions.*` (GD, v0.13). A MEGA asking an owner "Share it with the household?". Only
// the owner ever sees or answers one, and answering yes runs the owner's own share (convex/model/layers.ts).
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { calendarChanged } from './model/eventWrites';
import { shareItem } from './model/layers';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const mine = query({
  ...pick(API.shareSuggestions.mine),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const rows = await ctx.db
      .query('shareSuggestions')
      .withIndex('by_family_owner_status', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', viewer.member._id).eq('status', 'pending'))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const get = query({
  ...pick(API.shareSuggestions.get),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const s = await ctx.db.get(args.suggestionId);
    if (!s || s.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (s.ownerId !== viewer.member._id) fail('FORBIDDEN');
    return s;
  },
});

export const answer = mutation({
  ...pick(API.shareSuggestions.answer),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const s = await ctx.db.get(args.suggestionId);
    if (!s || s.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (s.ownerId !== viewer.member._id) fail('FORBIDDEN', 'only its owner can answer this');
    if (s.status !== 'pending') return null; // idempotent: already answered
    const now = await clock.now(ctx, viewer.member.familyId);
    if (args.share) {
      await shareItem(ctx, { familyId: s.familyId, ownerId: viewer.member._id, item: s.item, now, suggestionId: s._id });
      if (s.item.kind === 'event') await calendarChanged(ctx, s.familyId, now);
    }
    await ctx.db.patch(s._id, { status: args.share ? 'shared' : 'kept', answeredAt: now });
    return null;
  },
});
