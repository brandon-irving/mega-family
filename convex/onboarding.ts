// CONTRACT §4 "Session and onboarding". Creates the family, its admin member, their MEGA, default
// settings/sharing/profile and a thread. The rest of onboarding ("get to know you") happens in chat
// (`chat.send`), which is a day-1 stub, so it isn't built here.
import { v } from 'convex/values';
import { DEFAULT_THEME, FAMILY_MEGA_DEFAULTS, LIMITS, ROOM_DEFAULTS } from '../shared/config';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { fail } from './model/errors';
import { pick } from './model/define';
import { notBuiltYet } from './model/g5Stub';
import { randomDigits } from './model/random';
import { requireIdentity, requireViewer, tryViewer } from './model/viewer';
import { clock } from './ports/clock';

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

export const start = mutation({
  ...pick(API.onboarding.start),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail('UNAUTHENTICATED');
    const already = await ctx.db
      .query('members')
      .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (already) fail('VALIDATION', 'already a member of a family');
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

    return { familyId, threadId };
  },
});

// ---------- G5 (CONTRACT v0.17): the onboarding chat (Screen 13). Stubs until the G5 backend. ----------

export const begin = mutation({
  ...pick(API.onboarding.begin),
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return notBuiltYet('onboarding.begin');
  },
});

export const state = query({
  ...pick(API.onboarding.state),
  handler: async (ctx) => {
    await tryViewer(ctx);
    return null; // stub
  },
});

export const setName = mutation({
  ...pick(API.onboarding.setName),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('onboarding.setName');
  },
});

export const skip = mutation({
  ...pick(API.onboarding.skip),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('onboarding.skip');
  },
});
