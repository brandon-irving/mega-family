// CONTRACT §4 "Demo". `clock.jump` only works when the deployment opts into it (`DEMO_MODE=true`) — see
// `shared/config/demo.ts` for why the gate itself has to live here, read from the env, not in that file.
import { DEMO } from '../shared/config';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { tickFamilyLogic } from './model/proactive';
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

    // "fires due jobs through the same code" (CONTRACT §4): `tickFamilyLogic` (convex/model/proactive.ts)
    // is the exact same per-family sweep the production cron (convex/crons.ts) runs on a timer — releasing
    // held notifications, firing any candidate whose `deliverAt` the jump leapt past, and scanning every
    // trigger source (reminders, cross-member "matters to", daily check-in) for new candidates.
    await tickFamilyLogic(ctx, viewer.member.familyId);
    return null;
  },
});
