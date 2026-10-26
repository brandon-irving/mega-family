// CONTRACT §4 "Demo". `clock.jump` only works when the deployment opts into it (`DEMO_MODE=true`) — see
// `shared/config/demo.ts` for why the gate itself has to live here, read from the env, not in that file.
import { DEMO } from '../shared/config';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireAdmin, requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const get = query({
  ...pick(API.clock.get),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const row = await ctx.db
      .query('clocks')
      .withIndex('by_family', (q) => q.eq('familyId', viewer.member.familyId))
      .unique();
    return { now: await clock.now(ctx, viewer.member.familyId), mode: row?.mode ?? 'real' };
  },
});

export const jump = mutation({
  ...pick(API.clock.jump),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer.member.role);
    if (process.env[DEMO.envVar] !== 'true') fail('FORBIDDEN', 'demo mode is off on this deployment');
    await clock.jumpTo(ctx, viewer.member.familyId, args.to);

    // "fires due jobs through the same code" (CONTRACT §4): the one concrete effect in scope for G1 is
    // releasing notifications a kid's quiet hours were holding back (seed.ts's held reminder exercises
    // this). The rest of the proactive pipeline (candidates → judge → deliver) isn't built yet.
    const now = await clock.now(ctx, viewer.member.familyId);
    const members = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    for (const member of members) {
      const held = await ctx.db
        .query('notifications')
        .withIndex('by_family_recipient', (q) => q.eq('familyId', viewer.member.familyId).eq('recipientId', member._id))
        .collect();
      for (const n of held) if (n.sentAt === undefined && n.heldUntil !== undefined && n.heldUntil <= now) await ctx.db.patch(n._id, { sentAt: now });
    }
    return null;
  },
});
