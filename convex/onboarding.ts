// CONTRACT §4 "Session and onboarding". `onboarding.start` (tests, demo) creates the family, its admin member,
// their MEGA, default settings/sharing/profile and a thread in one step. G5 (v0.17): the app instead calls
// `onboarding.begin`, which creates the same family with an unnamed admin and opens the onboarding chat (Screen
// 13): "What should I call you?" → Gmail → a calendar → schedule links → the family step. The step machine lives
// in convex/model/onboarding.ts; `chat.send` / `chat.start` / `chat.answerBlock` route into it while it runs.
import { DEFAULT_THEME, FAMILY_MEGA_DEFAULTS, LIMITS, ROOM_DEFAULTS } from '../shared/config';
import { fillCopy, G5_COPY } from '../shared/config/copy';
import { ONBOARDING } from '../shared/config/onboarding';
import { API } from '../shared/domain/api';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { fail } from './model/errors';
import { pick } from './model/define';
import { onboardingRow, requireConnector } from './model/integrations';
import { afterName, completeOffer, postStep, setName as setNameLogic } from './model/onboarding';
import { randomDigits } from './model/random';
import { postOwnMegaMessage } from './model/threads';
import { requireViewer, tryViewer } from './model/viewer';
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

type NewFamily = { familyName: string; timezone: string; myName: string; megaName: string; look: Doc<'megas'>['look']; personality: Doc<'megas'>['personality'] };

/** Everything a new family starts with (shared by `onboarding.start` and `onboarding.begin`): the family and its
 * clock, the admin, their MEGA and the family MEGA, default settings/sharing/profile, the thread and the rooms. */
async function createFamily(ctx: MutationCtx, args: NewFamily): Promise<{ familyId: Id<'families'>; memberId: Id<'members'>; threadId: Id<'threads'>; now: number }> {
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

  return { familyId, memberId, threadId, now };
}

export const start = mutation({
  ...pick(API.onboarding.start),
  handler: async (ctx, args) => {
    const { familyId, threadId } = await createFamily(ctx, args);
    return { familyId, threadId };
  },
});

// ---------- G5 (CONTRACT v0.17): the onboarding chat (Screen 13). ----------

/** Sign up → the chat opens with the admin's MEGA (ONBOARDING.firstMega) asking "What should I call you?". The
 * name is empty until they answer; the thread counts as started, so `chat.start` never adds the generic adult
 * greeting on top. */
export const begin = mutation({
  ...pick(API.onboarding.begin),
  handler: async (ctx, { timezone }) => {
    const first = ONBOARDING.firstMega;
    const { familyId, memberId, threadId, now } = await createFamily(ctx, { familyName: '', timezone, myName: '', megaName: first.name, look: { ...first.look }, personality: first.personality });
    await ctx.db.patch(threadId, { startedAt: now });
    const rowId = await ctx.db.insert('onboarding', { familyId, memberId, step: 'name', outcomes: {}, startedAt: now });
    await postStep(ctx, (await ctx.db.get(rowId))!, now);
    return { familyId, threadId };
  },
});

export const state = query({
  ...pick(API.onboarding.state),
  handler: async (ctx) => {
    const viewer = await tryViewer(ctx);
    if (!viewer) return null;
    const row = await onboardingRow(ctx, viewer.member.familyId, viewer.member._id);
    if (!row) return null;
    const named = row.step !== 'name' && !!viewer.member.name;
    return { step: row.step, outcomes: row.outcomes, ...(row.personId ? { personId: row.personId } : {}), ...(named ? { callMe: viewer.member.name } : {}) };
  },
});

export const setName = mutation({
  ...pick(API.onboarding.setName),
  handler: async (ctx, { name }) => {
    const viewer = await requireViewer(ctx);
    const now = await clock.now(ctx, viewer.member.familyId);
    const named = await setNameLogic(ctx, viewer.member, name, now);
    // `chat.send` streams this line as its reply instead; here it's a plain MEGA message.
    await postOwnMegaMessage(ctx, viewer.member.familyId, viewer.member._id, { type: 'text', text: fillCopy(G5_COPY.niceToMeet, { name: named }) }, now);
    await afterName(ctx, viewer.member, now);
    return null;
  },
});

export const skip = mutation({
  ...pick(API.onboarding.skip),
  handler: async (ctx, { offer }) => {
    const viewer = await requireViewer(ctx);
    // v0.17b (C8): adults only, like every connect mutation.
    requireConnector(viewer.member);
    const now = await clock.now(ctx, viewer.member.familyId);
    await completeOffer(ctx, { familyId: viewer.member.familyId, memberId: viewer.member._id, offer, outcome: 'skipped', now });
    return null;
  },
});
