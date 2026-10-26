// CONTRACT §4 "Demo". Replaces the old `/demo-signin` HTTP route (Milestone G1 contract change — see
// CONTRACT.md's changelog, v0.4 pending approval): a contract function so the demo sign-in path goes
// through the same args/returns checking and privacy grid as everything else, instead of a hand-rolled
// HTTP handler. Requires an authenticated identity — an anonymous Better Auth session (`signInAnonymously`
// in src/services/auth.ts) is fine, since that's exactly the kid-without-Apple/Google path reused here —
// and is FORBIDDEN unless this deployment opted into DEMO_MODE.
import { API } from '../shared/domain/api';
import { SAMPLE_FAMILY } from '../shared/fixtures/sampleFamily';
import { DEMO } from '../shared/config';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireIdentity } from './model/viewer';
import type { Doc } from './_generated/dataModel';

export const signInAs = mutation({
  ...pick(API.demo.signInAs),
  handler: async (ctx, args) => {
    if (process.env[DEMO.envVar] !== 'true') fail('FORBIDDEN', 'demo mode is off on this deployment');
    const identity = await requireIdentity(ctx);

    // The most recently seeded family named SAMPLE_FAMILY.name — `_creationTime` (not the simulated
    // `createdAt` field, which can tie across seeds run moments apart) is what makes "most recent" exact.
    const families = (await ctx.db.query('families').collect()).filter((f) => f.name === SAMPLE_FAMILY.name);
    const family = families.reduce<Doc<'families'> | null>((latest, f) => (!latest || f._creationTime > latest._creationTime ? f : latest), null);
    if (!family) fail('NOT_FOUND', 'no sample family seeded on this deployment');

    // Unlink whatever member this identity is currently signed in as (switching demo members), so a
    // `members.by_authId` lookup never resolves to two different members for the same subject.
    const current = await ctx.db
      .query('members')
      .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (current) await ctx.db.patch(current._id, { authId: undefined });

    const sampleName = SAMPLE_FAMILY.members.find((m) => m.key === args.as)?.name;
    const members = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', family!._id))
      .collect();
    const target = members.find((m) => m.name === sampleName);
    if (!target) fail('NOT_FOUND', 'sample member not found on this deployment');

    await ctx.db.patch(target._id, { authId: identity.subject });
    return null;
  },
});
