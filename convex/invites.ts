// CONTRACT §4 "Session and onboarding" + PLAN.md → Sign-in. `invites.create` is for a member row that
// already exists but hasn't signed in yet (added by an admin outside this API's day-1 scope — "the rest
// happens in chat"); `invites.redeem` links that row's `authId` to whoever is signed in when they use it.
import { LIMITS } from '../shared/config';
import { API, LINKS } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { clock } from './ports/clock';
import { randomToken, sha256Hex } from './model/random';
import { requireIdentity, requireViewer, sameFamilyMember } from './model/viewer';

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

export const redeem = mutation({
  ...pick(API.invites.redeem),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query('members')
      .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (existing) fail('VALIDATION', 'already a member of a family');

    const hash = await sha256Hex(args.token);
    const invite = await ctx.db
      .query('invites')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hash))
      .unique();
    if (!invite) fail('INVALID_INVITE');
    const member = await ctx.db.get(invite.memberId);
    if (!member) fail('INVALID_INVITE');
    const now = await clock.now(ctx, member.familyId);
    if (invite.redeemedAt || invite.expiresAt <= now) fail('INVALID_INVITE');
    if (member.authId) fail('INVALID_INVITE'); // already claimed by a different sign-in

    if (member.role === 'kid') {
      const family = await ctx.db.get(member.familyId);
      if (!family || args.parentCode !== family.parentCode) fail('WRONG_PARENT_CODE');
    }

    await ctx.db.patch(invite._id, { redeemedAt: now });
    await ctx.db.patch(member._id, { authId: identity.subject, joinedAt: now });
    return { memberId: member._id };
  },
});
