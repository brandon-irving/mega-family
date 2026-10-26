// Builds the "viewer" (CONTRACT rule 3: the caller is never an argument). Every public function derives
// who's asking from the signed-in identity (Better Auth → `members.by_authId`), never from a client-supplied
// id, and permission checks compare against this, not against anything the client sent.
import { resolveAccent } from '../../shared/config/theme';
import type { Viewer } from '../../shared/domain/api';
import type { Role } from '../../shared/domain/enums';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';

type Ctx = QueryCtx | MutationCtx;

/** The signed-in Better Auth identity, or throws UNAUTHENTICATED. */
export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail('UNAUTHENTICATED');
  return identity;
}

/** The caller's `members` row, found by their auth subject. Throws NOT_A_MEMBER if they haven't joined a
 * family yet (signed in, but no `invites.redeem` / `onboarding.start` has linked them to one). */
export async function requireMember(ctx: Ctx): Promise<Doc<'members'>> {
  const identity = await requireIdentity(ctx);
  const member = await ctx.db
    .query('members')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();
  if (!member) fail('NOT_A_MEMBER');
  return member;
}

/** Member ids this member is a parent of ("from is to's parent": relationships where `from` is them). */
export async function parentOf(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Id<'members'>[]> {
  const rows = await ctx.db
    .query('relationships')
    .withIndex('by_family_from', (q) => q.eq('familyId', familyId).eq('from', memberId))
    .collect();
  return rows.filter((r) => r.kind === 'parent').map((r) => r.to);
}

/** Builds the full `Viewer` (CONTRACT §4 `me.get`) from an already-loaded member row. */
export async function buildViewerFromMember(ctx: Ctx, member: Doc<'members'>): Promise<Viewer> {
  const family = await ctx.db.get(member.familyId);
  if (!family) fail('NOT_A_MEMBER'); // an orphaned member row; shouldn't happen outside broken test fixtures
  const mega = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', member.familyId).eq('ownerId', member._id))
    .unique();
  const settings = await ctx.db
    .query('settings')
    .withIndex('by_family_member', (q) => q.eq('familyId', member.familyId).eq('memberId', member._id))
    .unique();
  if (!settings) fail('NOT_A_MEMBER'); // every real member gets a settings row at onboarding/seed time
  const isParentOf = await parentOf(ctx, member.familyId, member._id);
  const accent = resolveAccent(settings.theme, settings.accent, mega?.look.hex ?? '#2FB8B0');
  return {
    member,
    family: { _id: family._id, name: family.name, timezone: family.timezone },
    mega: mega ?? null,
    settings,
    theme: { name: settings.theme, accent },
    isParentOf,
  };
}

/** The full viewer for the signed-in caller, or throws UNAUTHENTICATED / NOT_A_MEMBER. Use this in every
 * public function except `me.get`, which reports `null` instead of throwing so the app can show onboarding. */
export async function requireViewer(ctx: Ctx): Promise<Viewer> {
  return buildViewerFromMember(ctx, await requireMember(ctx));
}

/** `me.get`'s own entry point: `null` when signed out or not yet a member, never a thrown error. */
export async function tryViewer(ctx: Ctx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const member = await ctx.db
    .query('members')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();
  if (!member) return null;
  return buildViewerFromMember(ctx, member);
}

export function requireAdmin(role: Role) {
  if (role !== 'admin') fail('FORBIDDEN', 'admin only');
}

export function requireNotKid(role: Role, message = 'not allowed for kids') {
  if (role === 'kid') fail('FORBIDDEN', message);
}

/** Loads a member by id and checks they're in `familyId` — the standard guard for any function that takes
 * another member's id as an argument (CONTRACT rule 3's companion: the target is checked, not trusted). */
export async function sameFamilyMember(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Doc<'members'>> {
  const m = await ctx.db.get(memberId);
  if (!m || m.familyId !== familyId) fail('NOT_FOUND');
  return m;
}
