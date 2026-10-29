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
import { API, LINKS, type InvitePreview } from '../shared/domain/api';
import { inviteTokenFrom } from '../shared/inviteToken';
import * as T from '../shared/domain/tables';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { clock } from './ports/clock';
import { randomToken, sha256Hex } from './model/random';
import { requireViewer, sameFamilyMember } from './model/viewer';
import { checkedMega, defaultInviteMega } from './model/familyAdd';


async function ownMega(ctx: QueryCtx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Doc<'megas'> | null> {
  return ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId))
    .first();
}


export const create = mutation({
  ...pick(API.invites.create),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const member = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    const isAdmin = viewer.member.role === 'admin';
    const isParent = viewer.isParentOf.includes(member._id);
    if (!isAdmin && !isParent) fail('FORBIDDEN');
    if (member.authId) fail('VALIDATION', 'already joined');

    const mega = args.mega ? checkedMega(args.mega) : await defaultInviteMega(ctx, member);
    const { token, hash } = await randomToken();
    const now = await clock.now(ctx, viewer.member.familyId);
    const expiresAt = now + LIMITS.invite.ttlHours * 60 * 60_000;
    await ctx.db.insert('invites', { familyId: viewer.member.familyId, memberId: member._id, tokenHash: hash, expiresAt, invitedBy: viewer.member._id, mega });
    // v0.17b: the QR carries the full join link, so the phone's own camera opens MEGA (preview/redeem take either).
    const url = LINKS.join(token);
    return { url, qrPayload: url, expiresAt };
  },
});

/** v0.17b (G5 review U3): the invite state on a member's Family row — admin or that member's parent only. The link
 * can't be read back (only its hash is stored); "Show invite" calls `create` for a fresh one. */
export const forMember = query({
  ...pick(API.invites.forMember),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const member = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    if (viewer.member.role !== 'admin' && !viewer.isParentOf.includes(member._id)) fail('FORBIDDEN');
    if (member.authId) return { status: 'joined' as const };
    const latest = await ctx.db
      .query('invites')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', member._id))
      .order('desc')
      .first();
    if (!latest || latest.redeemedAt) return { status: 'none' as const };
    const now = await clock.now(ctx, viewer.member.familyId);
    if (latest.expiresAt <= now) return { status: 'expired' as const, expiresAt: latest.expiresAt };
    const inviter = latest.invitedBy ? await ctx.db.get(latest.invitedBy) : null;
    return { status: 'pending' as const, expiresAt: latest.expiresAt, invitedByName: inviter?.name ?? '' };
  },
});

/** `token` may be the bare code or the full join link (a scanned QR or a pasted link). */
async function inviteByToken(ctx: QueryCtx, token: string): Promise<Doc<'invites'> | null> {
  const hash = await sha256Hex(inviteTokenFrom(token));
  return ctx.db
    .query('invites')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hash))
    .unique();
}

/** Screen 9 redesign (v0.14): the invite card, readable before the caller is anyone's member (the token is
 * the credential). Names and MEGA looks only — never an id, the parent code or the token hash. */
export const preview = query({
  ...pick(API.invites.preview),
  handler: async (ctx, args): Promise<InvitePreview> => {
    const invite = await inviteByToken(ctx, args.token);
    if (!invite || invite.redeemedAt) return { status: 'invalid' };
    const member = await ctx.db.get(invite.memberId);
    const family = member ? await ctx.db.get(member.familyId) : null;
    if (!member || !family || member.authId) return { status: 'invalid' };

    const inviterId = invite.invitedBy ?? family.adminId;
    const inviter = inviterId ? await ctx.db.get(inviterId) : null;
    const inviterName = inviter?.name ?? '';
    const now = await clock.now(ctx, member.familyId);
    if (invite.expiresAt <= now) return { status: 'expired', inviterName };
    if (member.role === 'kid' && (invite.failedAttempts ?? 0) >= LIMITS.maxParentCodeAttempts) return { status: 'locked', inviterName };

    const members = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', member.familyId))
      .collect();
    const familyCards = [];
    for (const m of members) {
      if (!m.authId) continue;
      const mega = await ownMega(ctx, m.familyId, m._id);
      if (mega) familyCards.push({ name: m.name, hex: mega.look.hex, sticker: mega.look.sticker });
    }
    return {
      status: 'ok',
      kind: member.role === 'kid' ? 'kid' : 'adult',
      inviterName,
      memberName: member.name,
      mega: invite.mega ?? (await defaultInviteMega(ctx, member)),
      family: familyCards,
    };
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

    const invite = await inviteByToken(ctx, args.token);
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
  args: { inviteId: v.id('invites'), memberId: v.id('members'), authSubject: v.string(), mega: v.optional(T.inviteMega) },
  returns: v.object({ memberId: v.id('members') }),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    const invite = await ctx.db.get(args.inviteId);
    if (!member || !invite) fail('INVALID_INVITE');
    // Re-checked here, inside the one transaction that writes (GD review): `redeem` reads in
    // `prepareRedeem` and writes here, so two concurrent redeems could both pass the read. Convex
    // serializes these mutations, so the second sees the first's claim and is refused.
    if (invite.redeemedAt || member.authId) fail('INVALID_INVITE');
    const alreadyMember = await ctx.db
      .query('members')
      .withIndex('by_authId', (q) => q.eq('authId', args.authSubject))
      .first();
    if (alreadyMember) fail('VALIDATION');
    const now = await clock.now(ctx, member.familyId);
    await ctx.db.patch(args.inviteId, { redeemedAt: now });
    await ctx.db.patch(args.memberId, { authId: args.authSubject, joinedAt: now, hasMega: true });

    // The MEGA comes with the invite (v0.14): an adult's change wins, then the admin's choice, then a default.
    // A member who already has a MEGA keeps that one row — patched, never duplicated.
    const existing = await ownMega(ctx, member.familyId, member._id);
    const chosen = args.mega ?? (existing ? undefined : (invite.mega ?? (await defaultInviteMega(ctx, member))));
    if (existing && chosen) await ctx.db.patch(existing._id, { name: chosen.name, look: chosen.look, personality: chosen.personality });
    else if (!existing && chosen)
      await ctx.db.insert('megas', {
        familyId: member.familyId,
        kind: 'member',
        ownerId: member._id,
        ...chosen,
        job: { station: 'charger', label: 'Resting', busy: false, since: now },
      });
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

    // An adult's change to the invite's MEGA is checked before anything is used up (VALIDATION).
    const mega = args.mega ? checkedMega(args.mega) : undefined;
    const info = await ctx.runQuery(internal.invites.prepareRedeem, { token: args.token, authId: identity.subject });
    if (!info.ok) fail(info.code);
    // Kids can't change the MEGA the admin made them (owner, Oct 28) — refused before the parent code is
    // even checked, so trying doesn't count as a wrong guess.
    if (info.role === 'kid' && mega) fail('FORBIDDEN', "kids can't change their MEGA when joining");

    if (info.role === 'kid') {
      // Brute-force guard (G1 fix): a 5-digit code is only 100,000 combinations. The lockout check runs
      // *before* comparing the code, so a correct guess after lockout still fails.
      if (info.failedAttempts >= LIMITS.maxParentCodeAttempts) fail('RATE_LIMITED', 'too many wrong codes — ask the admin for a new invite');
      if (args.parentCode !== info.parentCode) {
        await ctx.runMutation(internal.invites.bumpFailedAttempts, { inviteId: info.inviteId, attempts: info.failedAttempts + 1 });
        fail('WRONG_PARENT_CODE');
      }
    }

    return ctx.runMutation(internal.invites.finishRedeem, { inviteId: info.inviteId, memberId: info.memberId, authSubject: identity.subject, mega });
  },
});
