// One creation path for normal onboarding and the isolated fresh-admin demo.
import { DEFAULT_THEME, FAMILY_MEGA_DEFAULTS, LIMITS, ROOM_DEFAULTS } from '../../shared/config';
import { ONBOARDING } from '../../shared/config/onboarding';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { fail } from './errors';
import { randomDigits } from './random';
import { postStep } from './onboarding';
import { clock } from '../ports/clock';

const emptyProactive = { sent: 0, answered: 0, ignored: 0, up: 0, down: 0 };

/** `shared/time.ts`'s helpers (and every event/reminder/clock computation downstream) call
 * `Intl.DateTimeFormat` with a family's stored timezone; an invalid IANA zone name throws a bare
 * `RangeError` wherever that later runs, not a `ConvexError` — so it's rejected once, here, at the door. */
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type NewFamily = { familyName: string; timezone: string; myName: string; megaName: string; look: Doc<'megas'>['look']; personality: Doc<'megas'>['personality'] };

/** Everything a new family starts with (shared by `onboarding.start` and `onboarding.begin`): the family and its
 * clock, the admin, their MEGA and the family MEGA, default settings/sharing/profile, the thread and the rooms. */
export async function createFamily(ctx: MutationCtx, args: NewFamily): Promise<{ familyId: Id<'families'>; memberId: Id<'members'>; threadId: Id<'threads'>; now: number }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail('UNAUTHENTICATED');
  const already = await ctx.db
    .query('members')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();
  if (already) fail('VALIDATION', 'already a member of a family');
  const demo = await ctx.db.query('demoProfiles').withIndex('by_authId', q => q.eq('authId', identity.subject)).unique();
  if (demo?.pendingInvite) fail('VALIDATION', 'Finish testing your invitation or choose Back to admin first.');
  if (!isValidTimeZone(args.timezone)) fail('VALIDATION', 'invalid timezone');

  const now = clock.bootstrap(); // the one wall-clock read outside ports/clock.ts's own adapter (see its docstring)
  const familyId = await ctx.db.insert('families', {
    name: args.familyName,
    timezone: args.timezone,
    parentCode: randomDigits(LIMITS.parentCodeDigits),
    createdAt: now,
  });
  await ctx.db.insert('clocks', { familyId, mode: 'real', offsetMs: 0 });

  const memberId = await ctx.db.insert('members', {
    familyId,
    name: args.myName,
    role: 'admin',
    authId: identity.subject,
    activities: [],
    hasMega: true,
    joinedAt: now,
  });
  await ctx.db.patch(familyId, { adminId: memberId });

  const megaId = await ctx.db.insert('megas', {
    familyId,
    kind: 'member',
    ownerId: memberId,
    name: args.megaName,
    look: args.look,
    personality: args.personality,
    job: { station: 'charger', label: 'Resting', busy: false, since: now },
  });
  await ctx.db.insert('megas', {
    familyId,
    kind: 'family',
    name: FAMILY_MEGA_DEFAULTS.name,
    look: { hex: FAMILY_MEGA_DEFAULTS.hex, sticker: FAMILY_MEGA_DEFAULTS.sticker },
    personality: FAMILY_MEGA_DEFAULTS.personality,
    job: { station: 'charger', label: 'Resting', busy: false, since: now },
  });

  await ctx.db.insert('settings', {
    familyId,
    memberId,
    theme: DEFAULT_THEME,
    accent: 'theme',
    wallpaper: null,
    notify: { loudKinds: ['reminder', 'request'], quietHours: LIMITS.quietHours.adult, dailyCap: LIMITS.push.dailyCapAdult },
    pushTokens: [],
  });
  await ctx.db.insert('sharing', { familyId, memberId, schedule: 'family', lists: 'family', hqActivity: 'family' });
  await ctx.db.insert('profiles', {
    familyId,
    memberId,
    callMe: args.myName,
    basics: {},
    routines: [],
    places: [],
    proactive: { reminder: { ...emptyProactive }, request: { ...emptyProactive }, tip: { ...emptyProactive }, update: { ...emptyProactive } },
    checkQuestions: [],
  });

  const threadId = await ctx.db.insert('threads', { familyId, ownerId: memberId, megaIds: [megaId], lastAt: now });

  await ctx.db.insert('rooms', { familyId, ...ROOM_DEFAULTS.hq, furniture: [] });
  await ctx.db.insert('rooms', { familyId, ownerId: memberId, ...ROOM_DEFAULTS.member, furniture: [] });

  return { familyId, memberId, threadId, now };
}

export async function beginFamily(ctx: MutationCtx, timezone: string) {
    const first = ONBOARDING.firstMega;
    const { familyId, memberId, threadId, now } = await createFamily(ctx, { familyName: '', timezone, myName: '', megaName: first.name, look: { ...first.look }, personality: first.personality });
    await ctx.db.patch(threadId, { startedAt: now });
    const rowId = await ctx.db.insert('onboarding', { familyId, memberId, step: 'name', outcomes: {}, startedAt: now });
    await postStep(ctx, (await ctx.db.get(rowId))!, now);
    return { familyId, threadId, memberId };
}
