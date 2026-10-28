// CONTRACT §4 `chores.*` (GD, v0.13). Kids see and finish their own chores; adults manage any kid's and
// approve "Done" by releasing Mega Bucks (`bucks.release`). See convex/model/chores.ts.
import { MEGA_BUCKS } from '../shared/config/store';
import { API } from '../shared/domain/api';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { choreViewOf, isManager, markChoreDone, validateSchedule } from './model/chores';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer, sameFamilyMember } from './model/viewer';
import { clock } from './ports/clock';

export const list = query({
  ...pick(API.chores.list),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const familyId = viewer.member.familyId;
    let rows: Doc<'chores'>[];
    if (viewer.member.role === 'kid') {
      if (args.memberId && args.memberId !== viewer.member._id) fail('FORBIDDEN', 'you can only see your own chores');
      rows = await ctx.db
        .query('chores')
        .withIndex('by_family_for', (q) => q.eq('familyId', familyId).eq('forMemberId', viewer.member._id))
        .collect();
    } else if (args.memberId) {
      const kid = await sameFamilyMember(ctx, familyId, args.memberId);
      rows = await ctx.db
        .query('chores')
        .withIndex('by_family_for', (q) => q.eq('familyId', familyId).eq('forMemberId', kid._id))
        .collect();
    } else {
      rows = await ctx.db
        .query('chores')
        .withIndex('by_family_for', (q) => q.eq('familyId', familyId))
        .collect();
    }
    const now = await clock.now(ctx, familyId);
    return Promise.all(rows.map((c) => choreViewOf(ctx, c, viewer.family.timezone, now)));
  },
});

export const claim = query({
  ...pick(API.chores.claim),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (viewer.member.role === 'kid' && claim.forMemberId !== viewer.member._id) fail('FORBIDDEN');
    const chore = (await ctx.db.get(claim.choreId))!;
    return { chore, today: claim };
  },
});

export const create = mutation({
  ...pick(API.chores.create),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!isManager(viewer.member.role)) fail('FORBIDDEN', 'only a grown-up can set chores');
    const kid = await sameFamilyMember(ctx, viewer.member.familyId, args.forMemberId);
    if (kid.role !== 'kid') fail('VALIDATION', 'chores are for kids');
    if (!args.title.trim()) fail('VALIDATION', 'a chore needs a name');
    validateSchedule(args.days, args.time);
    const bucks = args.bucks ?? MEGA_BUCKS.defaults.chore;
    if (!Number.isInteger(bucks) || bucks < MEGA_BUCKS.minRelease || bucks > MEGA_BUCKS.maxRelease) fail('VALIDATION', 'bucks out of range');
    return ctx.db.insert('chores', { familyId: viewer.member.familyId, forMemberId: kid._id, title: args.title.trim(), bucks, days: args.days, time: args.time, createdBy: viewer.member._id, active: true });
  },
});

export const update = mutation({
  ...pick(API.chores.update),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!isManager(viewer.member.role)) fail('FORBIDDEN', 'only a grown-up can change chores');
    const chore = await ctx.db.get(args.choreId);
    if (!chore || chore.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const p = args.patch;
    validateSchedule(p.days ?? chore.days, p.time ?? chore.time);
    if (p.bucks !== undefined && (!Number.isInteger(p.bucks) || p.bucks < MEGA_BUCKS.minRelease || p.bucks > MEGA_BUCKS.maxRelease)) fail('VALIDATION', 'bucks out of range');
    if (p.title !== undefined && !p.title.trim()) fail('VALIDATION', 'a chore needs a name');
    await ctx.db.patch(chore._id, Object.fromEntries(Object.entries({ ...p, title: p.title?.trim() }).filter(([, v]) => v !== undefined)));
    return null;
  },
});

export const markDone = mutation({
  ...pick(API.chores.markDone),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const chore = await ctx.db.get(args.choreId);
    if (!chore || chore.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const now = await clock.now(ctx, viewer.member.familyId);
    return markChoreDone(ctx, { chore, kid: viewer.member, tz: viewer.family.timezone, now });
  },
});

export const decline = mutation({
  ...pick(API.chores.decline),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!isManager(viewer.member.role)) fail('FORBIDDEN', 'only a grown-up can decline a chore');
    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (claim.status !== 'claimed') fail('VALIDATION', 'that chore isn’t waiting for approval');
    const now = await clock.now(ctx, viewer.member.familyId);
    await ctx.db.patch(claim._id, { status: 'declined', decidedById: viewer.member._id, decidedAt: now });
    return null;
  },
});
