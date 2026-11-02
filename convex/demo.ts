import { inviteByToken } from './model/inviteLookup';
import { inviteTokenFrom } from '../shared/inviteToken';
import { clock } from './ports/clock';
import { freshConsole } from './model/demoConsole';
// CONTRACT §4 "Demo". Replaces the old `/demo-signin` HTTP route (Milestone G1 contract change — see
// CONTRACT.md's changelog, v0.4 pending approval): a contract function so the demo sign-in path goes
// through the same args/returns checking and privacy grid as everything else, instead of a hand-rolled
// HTTP handler. Requires an authenticated identity — an anonymous Better Auth session (`signInAnonymously`
// in src/services/auth.ts) is fine, since that's exactly the kid-without-Apple/Google path reused here —
// and is FORBIDDEN unless this deployment opted into DEMO_MODE.
import { API } from '../shared/domain/api';
import { DEMO } from '../shared/config';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireIdentity, requireMember, requireAdmin, tryViewer } from './model/viewer';

/** The identity owns its sandbox even while trying the recipient's permissions. */
export const profile = query({
  ...pick(API.demo.profile),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const viewer = await tryViewer(ctx);
    const row = await ctx.db.query('demoProfiles').withIndex('by_authId', q => q.eq('authId', identity.subject)).unique();
    if (!row) return viewer?.member.role === 'admin' && process.env[DEMO.envVar] === 'true' ? { active: false, canResume: false } : null;
    const currentId = viewer?.member._id;
    const active = currentId === row.demoMemberId || !!row.testedMemberIds?.includes(currentId!) || (!viewer && !!row.pendingInvite);
    if (!active && (currentId !== row.originalMemberId || process.env[DEMO.envVar] !== 'true')) return null;
    if (!active) return { active: false, canResume: true };
    const people = [];
    for (const id of [row.demoMemberId, ...(row.testedMemberIds ?? [])]) {
      const person = await ctx.db.get(id);
      if (person) people.push({ memberId: person._id, name: person.name || 'Demo admin' });
    }
    const admin = await ctx.db.get(row.demoMemberId);
    const run = admin && process.env[DEMO.envVar] === 'true' ? await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', admin.familyId)).filter(q => q.eq(q.field('active'), true)).first() : null;
    const recording = run?.ownerAuthId === identity.subject ? { runId: run._id, key: run.key, familyId: run.familyId } : undefined;
    return { recording, active: true, canResume: false, testing: currentId !== row.demoMemberId, pendingToken: row.pendingInvite?.token,
      currentName: viewer?.member.name || (row.pendingInvite ? 'Invite preview' : 'Demo admin'), people };
  },
});

/** Park the admin, then open the actual invitation. Acceptance still uses invites.redeem. */
export const testInvite = mutation({
  ...pick(API.demo.testInvite),
  handler: async (ctx, args) => {
    if (process.env[DEMO.envVar] !== 'true') fail('FORBIDDEN');
    const member = await requireMember(ctx);
    requireAdmin(member.role);
    if (member._id !== args.expectedMemberId) return null;
    const row = await ctx.db.query('demoProfiles').withIndex('by_authId', q => q.eq('authId', member.authId!)).unique();
    if (!row || row.demoMemberId !== member._id) fail('FORBIDDEN', 'Start a fresh demo first.');
    const invite = await inviteByToken(ctx, args.token);
    const recipient = invite ? await ctx.db.get(invite.memberId) : null;
    const now = await clock.now(ctx, member.familyId);
    if (!invite || !recipient || recipient.familyId !== member.familyId || recipient.authId || recipient.joinedAt !== undefined || invite.redeemedAt || invite.expiresAt <= now) fail('INVALID_INVITE');
    await ctx.db.patch(row._id, { pendingInvite: { token: inviteTokenFrom(args.token), memberId: recipient._id, inviteId: invite._id } });
    await ctx.db.patch(member._id, { authId: undefined });
    return null;
  },
});

/** Only the sandbox owner can revisit profiles they actually redeemed in this run. */
export const switchTester = mutation({
  ...pick(API.demo.switchTester),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const row = await ctx.db.query('demoProfiles').withIndex('by_authId', q => q.eq('authId', identity.subject)).unique();
    if (!row) fail('FORBIDDEN');
    const current = await ctx.db.query('members').withIndex('by_authId', q => q.eq('authId', identity.subject)).unique();
    if ((current?._id ?? null) !== args.expectedMemberId) return null;
    const allowed = [row.demoMemberId, ...(row.testedMemberIds ?? [])];
    if (current ? !allowed.includes(current._id) : !row.pendingInvite) fail('FORBIDDEN');
    const targetId = args.memberId ?? row.demoMemberId;
    if (!allowed.includes(targetId)) fail('FORBIDDEN');
    if (targetId !== row.demoMemberId && process.env[DEMO.envVar] !== 'true') fail('FORBIDDEN');
    const [admin, target] = await Promise.all([ctx.db.get(row.demoMemberId), ctx.db.get(targetId)]);
    if (!admin || !target || admin.familyId !== target.familyId) fail('NOT_FOUND');
    if (target.authId && target.authId !== identity.subject) fail('FORBIDDEN');
    if (current) await ctx.db.patch(current._id, { authId: undefined });
    await ctx.db.patch(targetId, { authId: identity.subject });
    await ctx.db.patch(row._id, { pendingInvite: undefined });
    return null;
  },
});

/** Atomic switch: preserve the original family and re-use the real onboarding path for every fresh run.
 * A previous run is retained as development data; this command never deletes family records. */
export const switchProfile = mutation({
  ...pick(API.demo.switchProfile),
  handler: async (ctx, { mode, expectedMemberId }) => {
    // Returning must remain possible if DEMO_MODE is disabled during a demo.
    if (mode !== 'return' && process.env[DEMO.envVar] !== 'true') fail('FORBIDDEN');
    const current = await requireMember(ctx);
    requireAdmin(current.role);
    // A replay or double tap from a previous profile cannot start a second family.
    if (current._id !== expectedMemberId) return null;
    const authId = current.authId!;
    const row = await ctx.db.query('demoProfiles').withIndex('by_authId', q => q.eq('authId', authId)).unique();
    if (row && current._id !== row.originalMemberId && current._id !== row.demoMemberId) fail('VALIDATION', 'Return to your saved profile before switching demos.');
    if (mode === 'fresh') {
      await freshConsole(ctx);
      return null;
    }
    if (!row) fail('NOT_FOUND', 'No saved demo profile.');
    const targetId = mode === 'return' ? row.originalMemberId : row.demoMemberId;
    if (targetId === current._id) return null;
    const target = await ctx.db.get(targetId);
    if (!target || target.role !== 'admin' || !await ctx.db.get(target.familyId)) fail('NOT_FOUND', 'Saved profile is no longer available.');
    if (target.authId && target.authId !== authId) fail('FORBIDDEN', 'This profile is now signed in elsewhere.');
    await ctx.db.patch(current._id, { authId: undefined });
    await ctx.db.patch(targetId, { authId });
    return null;
  },
});
