// CONTRACT §4 "Session and onboarding" + PLAN.md → Sign-in. `invites.create` is for a member row that
// already exists but hasn't signed in yet (added by an admin outside this API's day-1 scope — "the rest
// happens in chat"); `invites.redeem` links that row's `authId` to whoever is signed in when they use it.
//
// `redeem` is an ACTION, not a mutation (CONTRACT.md v0.5 — see changelog). A wrong parent-code guess has
// to bump `invites.failedAttempts` (the brute-force lockout, G1 fix) even though the call still reports
// WRONG_PARENT_CODE to the caller — but Convex mutations are strictly atomic: any write made earlier in a
// mutation handler is rolled back if that same handler later throws, and a mutation nested via
// `ctx.runMutation` is only a *sub*-transaction of the same atomic unit (Convex docs: it "runs in a
// sub-transaction, so if it throws... its writes will be rolled back" — the same is true in reverse, since
// the whole thing is one top-level mutation), so there's no way to make the counter survive a thrown error
// from inside a single mutation. An action's `ctx.runMutation` calls are each their own already-committed
// transaction, independent of whatever the action does afterward (including throwing), so splitting the
// read-only lookup, the counter bump and the actual redeem into three internal functions — called from a
// thin action — is the documented pattern for "commit a side effect even though the overall call fails."
import { type Infer, v } from 'convex/values';
import { LIMITS } from '../shared/config';
import { API, LINKS } from '../shared/domain/api';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery, mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { clock } from './ports/clock';
import { randomToken, sha256Hex } from './model/random';
import { requireViewer, sameFamilyMember } from './model/viewer';

export const create = mutation({
  ...pick(API.invites.create),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const member = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    const isAdmin = viewer.member.role === 'admin';
    const isParent = viewer.isParentOf.includes(member._id);
    if (!isAdmin && !isParent) fail('FORBIDDEN');
    if (member.authId) fail('VALIDATION', 'already joined');

    const { token, hash } = await randomToken();
    const now = await clock.now(ctx, viewer.member.familyId);
    const expiresAt = now + LIMITS.invite.ttlHours * 60 * 60_000;
    await ctx.db.insert('invites', { familyId: viewer.member.familyId, memberId: member._id, tokenHash: hash, expiresAt });
    return { url: LINKS.join(token), qrPayload: token, expiresAt };
  },
});

const redeemLookup = v.union(
  v.object({
    ok: v.literal(true),
    inviteId: v.id('invites'),
    memberId: v.id('members'),
    role: v.union(v.literal('admin'), v.literal('adult'), v.literal('kid')),
    failedAttempts: v.number(),
    parentCode: v.string(),
  }),
  v.object({ ok: v.literal(false), code: v.union(v.literal('VALIDATION'), v.literal('INVALID_INVITE')) }),
);

/** Every read-only check `redeem` needs, in one round trip: the caller doesn't already belong to a
 * family, and the token resolves to a still-unredeemed, unexpired, unclaimed invite. No writes, so it's
 * always safe for the action to throw straight from whatever this returns. */
export const prepareRedeem = internalQuery({
  args: { token: v.string(), authId: v.string() },
  returns: redeemLookup,
  handler: async (ctx, args): Promise<Infer<typeof redeemLookup>> => {
    const existing = await ctx.db
      .query('members')
      .withIndex('by_authId', (q) => q.eq('authId', args.authId))
      .unique();
    if (existing) return { ok: false, code: 'VALIDATION' };

    const hash = await sha256Hex(args.token);
    const invite = await ctx.db
      .query('invites')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hash))
      .unique();
    if (!invite) return { ok: false, code: 'INVALID_INVITE' };
    const member = await ctx.db.get(invite.memberId);
    if (!member) return { ok: false, code: 'INVALID_INVITE' };
    const family = await ctx.db.get(member.familyId);
    if (!family) return { ok: false, code: 'INVALID_INVITE' };
    const now = await clock.now(ctx, member.familyId);
    if (invite.redeemedAt || invite.expiresAt <= now || member.authId) return { ok: false, code: 'INVALID_INVITE' };

    return { ok: true, inviteId: invite._id, memberId: member._id, role: member.role, failedAttempts: invite.failedAttempts ?? 0, parentCode: family.parentCode };
  },
});

/** Records one more wrong parent-code guess. Called as its own committed transaction (not nested inside
 * the mutation that also throws WRONG_PARENT_CODE) so the count survives — see this file's docstring. */
export const bumpFailedAttempts = internalMutation({
  args: { inviteId: v.id('invites'), attempts: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.inviteId, { failedAttempts: args.attempts });
    return null;
  },
});

/** The actual join: marks the invite redeemed and links the caller's identity to the member row. */
export const finishRedeem = internalMutation({
  args: { inviteId: v.id('invites'), memberId: v.id('members'), authSubject: v.string() },
  returns: v.object({ memberId: v.id('members') }),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) fail('INVALID_INVITE');
    const now = await clock.now(ctx, member.familyId);
    await ctx.db.patch(args.inviteId, { redeemedAt: now });
    await ctx.db.patch(args.memberId, { authId: args.authSubject, joinedAt: now });
    return { memberId: args.memberId };
  },
});

export const redeem = action({
  ...pick(API.invites.redeem),
  // An explicit return type is required here (not just inferred from the body): this handler calls
  // `internal.invites.*` — other functions defined in *this same file* — and the generated `internal`
  // object's type is built from this whole module's exports, `redeem` included. Without the annotation,
  // TS would need `redeem`'s own inferred type to resolve `internal.invites.finishRedeem`'s type to then
  // infer `redeem`'s return type: a circular reference.
  handler: async (ctx, args): Promise<{ memberId: Id<'members'> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail('UNAUTHENTICATED');

    const info = await ctx.runQuery(internal.invites.prepareRedeem, { token: args.token, authId: identity.subject });
    if (!info.ok) fail(info.code);

    if (info.role === 'kid') {
      // Brute-force guard (G1 fix): a 5-digit code is only 100,000 combinations. The lockout check runs
      // *before* comparing the code, so a correct guess after lockout still fails.
      if (info.failedAttempts >= LIMITS.maxParentCodeAttempts) fail('RATE_LIMITED', 'too many wrong codes — ask the admin for a new invite');
      if (args.parentCode !== info.parentCode) {
        await ctx.runMutation(internal.invites.bumpFailedAttempts, { inviteId: info.inviteId, attempts: info.failedAttempts + 1 });
        fail('WRONG_PARENT_CODE');
      }
    }

    return ctx.runMutation(internal.invites.finishRedeem, { inviteId: info.inviteId, memberId: info.memberId, authSubject: identity.subject });
  },
});
