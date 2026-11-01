import { ageGroupOf, type AgeGroup } from '../../shared/ageGroups';
// G5 (CONTRACT v0.17 `family.add`): the admin adds a person (the onboarding family step, later Family → Add).
// The member has no login until they redeem an invite; they get the same rows the seed gives its members
// (settings, sharing or kid controls, profile), the relationship both ways (and, for a kid, a parent link from
// the admin's partner too, so both grown-ups can parent), and a MEGA when one is picked.
import { KID_SAFETY, LIMITS } from '../../shared/config';
import { COLORS, HEX_RE, INVITE_MEGA_DEFAULTS } from '../../shared/config/looks';
import { ONBOARDING } from '../../shared/config/onboarding';
import type { Relationship } from '../../shared/domain/enums';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';

const emptyCounts = { sent: 0, answered: 0, ignored: 0, up: 0, down: 0 };
const KID_RELATIONSHIPS: readonly Relationship[] = ['daughter', 'son', 'child'];

/** What the admin is to the new person, given what the new person is to the admin. */
function reciprocal(rel: Relationship): Relationship {
  if (KID_RELATIONSHIPS.includes(rel)) return 'parent';
  if (rel === 'parent') return 'child';
  if (rel === 'partner' || rel === 'sibling') return rel;
  return 'other';
}

export type NewMega = { name: string; look: Doc<'megas'>['look']; personality: Doc<'megas'>['personality'] };

/** The MEGA an invite (or the onboarding look block) starts from when the admin didn't set one: the member's
 * existing MEGA, else the first preset color no MEGA in the family wears (config INVITE_MEGA_DEFAULTS). */
export async function defaultInviteMega(ctx: QueryCtx | MutationCtx, member: Doc<'members'>): Promise<NewMega> {
  const existing = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', member.familyId).eq('ownerId', member._id))
    .first();
  if (existing) return { name: existing.name, look: existing.look, personality: existing.personality };
  const worn = new Set(
    (await ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', member.familyId)).collect()).map((m) => m.look.hex.toUpperCase()),
  );
  const presets = Object.entries(COLORS) as [keyof typeof COLORS, string][];
  const [key, hex] = presets.find(([, c]) => !worn.has(c.toUpperCase())) ?? presets[0];
  const kind = member.role === 'kid' ? 'kid' : 'adult';
  return { name: INVITE_MEGA_DEFAULTS.names[key], look: { hex, sticker: INVITE_MEGA_DEFAULTS.sticker }, personality: INVITE_MEGA_DEFAULTS.personality[kind] };
}

/** A MEGA name or look someone typed (the admin on `invites.create` / `family.add` / the look block, an adult
 * on `invites.redeem`): trimmed name of a sane length, a real hex color. VALIDATION otherwise. */
export function checkedMega<T extends NewMega>(mega: T): T {
  const name = mega.name.trim();
  if (!name || name.length > INVITE_MEGA_DEFAULTS.maxNameLength) fail('VALIDATION', 'MEGA name');
  if (!HEX_RE.test(mega.look.hex)) fail('VALIDATION', 'MEGA color');
  return { ...mega, name };
}

/** Creates the member's MEGA, or restyles the one they already have (never two). */
export async function giveMega(ctx: MutationCtx, member: Doc<'members'>, mega: NewMega, now: number): Promise<Id<'megas'>> {
  const checked = checkedMega(mega);
  const existing = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', member.familyId).eq('ownerId', member._id))
    .unique();
  await ctx.db.patch(member._id, { hasMega: true });
  if (existing) {
    await ctx.db.patch(existing._id, { name: checked.name, look: checked.look, personality: checked.personality });
    return existing._id;
  }
  return ctx.db.insert('megas', { familyId: member.familyId, kind: 'member', ownerId: member._id, ...checked, job: { station: 'charger', label: 'Resting', busy: false, since: now } });
}

/** True at ONBOARDING.maxFamilyMembers (a sanity cap; the onboarding family step offers "Done for now", C12). */
export async function familyIsFull(ctx: QueryCtx | MutationCtx, familyId: Id<'families'>): Promise<boolean> {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .take(ONBOARDING.maxFamilyMembers);
  return members.length >= ONBOARDING.maxFamilyMembers;
}

export async function addFamilyMember(
  ctx: MutationCtx,
  admin: Doc<'members'>,
  args: { name: string; role: 'adult' | 'kid'; relationship: Relationship; mega?: NewMega; birthday?: string; ageGroup?: AgeGroup },
  now: number,
): Promise<Id<'members'>> {
  if (admin.role !== 'admin') fail('FORBIDDEN', 'admin only');
  const name = args.name.trim();
  if (!name || name.length > ONBOARDING.nameMaxLength) fail('VALIDATION', 'name');
  if (args.birthday !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(args.birthday)) fail('VALIDATION', 'birthday');
  const familyId = admin.familyId;
  if (await familyIsFull(ctx, familyId)) fail('VALIDATION', 'family is full');

  const memberId = await ctx.db.insert('members', { familyId, name, role: args.role, birthday: args.birthday, ageGroup: args.ageGroup, activities: [], hasMega: false });
  await ctx.db.insert('relationships', { familyId, from: memberId, to: admin._id, kind: args.relationship });
  await ctx.db.insert('relationships', { familyId, from: admin._id, to: memberId, kind: reciprocal(args.relationship) });
  if (KID_RELATIONSHIPS.includes(args.relationship)) {
    const partners = await ctx.db
      .query('relationships')
      .withIndex('by_family_from', (q) => q.eq('familyId', familyId).eq('from', admin._id))
      .collect();
    for (const p of partners.filter((r) => r.kind === 'partner')) {
      await ctx.db.insert('relationships', { familyId, from: p.to, to: memberId, kind: 'parent' });
      await ctx.db.insert('relationships', { familyId, from: memberId, to: p.to, kind: 'child' });
    }
  }

  const isKid = args.role === 'kid';
  await ctx.db.insert('settings', {
    familyId,
    memberId,
    theme: 'midnight',
    accent: 'mega',
    wallpaper: null,
    notify: {
      loudKinds: isKid ? ['reminder'] : ['reminder', 'request'],
      quietHours: isKid ? LIMITS.quietHours.kid : LIMITS.quietHours.adult,
      dailyCap: isKid ? LIMITS.push.dailyCapKid : LIMITS.push.dailyCapAdult,
    },
    pushTokens: [],
  });
  if (isKid) {
    const d = KID_SAFETY.defaults;
    await ctx.db.insert('kidControls', {
      familyId,
      memberId,
      homeworkMode: d.homeworkMode,
      quietHours: LIMITS.quietHours.kid,
      dailyMinutes: d.dailyMinutes,
      blockedTopics: [],
      tellsParents: { ...d.tellsParents },
      parentsCanReadChat: ageGroupOf({ role: args.role, birthday: args.birthday, ageGroup: args.ageGroup }, new Date(now).toISOString().slice(0,10)) === 'teen' ? false : d.parentsCanReadChat,
      webSearch: d.webSearch,
    });
  } else {
    await ctx.db.insert('sharing', { familyId, memberId, schedule: 'family', lists: 'family', hqActivity: 'family' });
  }
  await ctx.db.insert('profiles', {
    familyId,
    memberId,
    callMe: name,
    basics: {},
    routines: [],
    places: [],
    proactive: { reminder: { ...emptyCounts }, request: { ...emptyCounts }, tip: { ...emptyCounts }, update: { ...emptyCounts } },
    checkQuestions: [],
  });
  if (args.mega) await giveMega(ctx, (await ctx.db.get(memberId))!, args.mega, now);
  return memberId;
}
