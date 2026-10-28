// CONTRACT §4 `proposals.*` (GD, v0.13). Hub's clash fixes: adults read them, only the Admin decides, and
// nothing changes until the Admin approves (convex/model/proposals.ts).
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { decideProposal, proposalViewOf } from './model/proposals';
import { requireNotKid, requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const open = query({
  ...pick(API.proposals.open),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireNotKid(viewer.member.role);
    const rows = await ctx.db
      .query('proposals')
      .withIndex('by_family_status', (q) => q.eq('familyId', viewer.member.familyId).eq('status', 'pending'))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(rows.map((p) => proposalViewOf(ctx, p)));
  },
});

export const get = query({
  ...pick(API.proposals.get),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireNotKid(viewer.member.role);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    return proposalViewOf(ctx, proposal);
  },
});

export const decide = mutation({
  ...pick(API.proposals.decide),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const now = await clock.now(ctx, viewer.member.familyId);
    await decideProposal(ctx, { proposalId: args.proposalId, approver: viewer.member, approve: args.approve, now });
    return null;
  },
});
