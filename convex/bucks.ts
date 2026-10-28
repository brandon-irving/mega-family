// CONTRACT §4 `bucks.*` (GD, v0.13). The Mega Bucks ledger: see convex/model/bucks.ts for the rules.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { balanceOf, bucksSubject, releaseBucks } from './model/bucks';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const balance = query({
  ...pick(API.bucks.balance),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const memberId = await bucksSubject(ctx, viewer, args.memberId);
    return { balance: await balanceOf(ctx, viewer.member.familyId, memberId) };
  },
});

export const history = query({
  ...pick(API.bucks.history),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const memberId = await bucksSubject(ctx, viewer, args.memberId);
    return ctx.db
      .query('bucksLedger')
      .withIndex('by_family_member_at', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', memberId))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const entry = query({
  ...pick(API.bucks.entry),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const row = await ctx.db.get(args.ledgerId);
    if (!row || row.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    await bucksSubject(ctx, viewer, row.memberId); // a kid: only their own rows; an adult: any kid's
    return row;
  },
});

export const release = mutation({
  ...pick(API.bucks.release),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const now = await clock.now(ctx, viewer.member.familyId);
    return releaseBucks(ctx, { adult: viewer.member, source: args.source, amount: args.amount, now });
  },
});
