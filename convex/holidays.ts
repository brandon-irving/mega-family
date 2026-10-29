// CONTRACT §4 `holidays.*` (G4b, v0.16) and the holiday cache refresh. Holidays come from the Holidays port
// (Nager.Date), cached per family × country × year (public data). The question and its effects live in
// convex/model/holidays.ts; queries read the cache only.
import { v } from 'convex/values';
import { HOLIDAYS } from '../shared/config/shopping';
import { API } from '../shared/domain/api';
import { holiday } from '../shared/domain/integrationShapes';
import { integrationFailure } from '../shared/domain/tables';
import { addDays, localDate } from '../shared/time';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { getHolidays } from './adapters/registry';
import { pick } from './model/define';
import { fail } from './model/errors';
import { answerHoliday, familyCountry, holidaysBetween, requireSkipForAdult, skipOn, storeYear, yearsInView } from './model/holidays';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const upcoming = query({
  ...pick(API.holidays.upcoming),
  handler: async (ctx, { days }) => {
    const viewer = await requireViewer(ctx);
    if (days !== undefined && (!Number.isInteger(days) || days < 1)) fail('VALIDATION', 'days must be a whole number of days');
    const span = Math.min(days ?? HOLIDAYS.upcomingDays, HOLIDAYS.maxUpcomingDays);
    const now = await clock.now(ctx, viewer.member.familyId);
    const today = localDate(now, viewer.family.timezone);
    const family = await ctx.db.get(viewer.member.familyId);
    if (!family) fail('NOT_FOUND');
    const list = await holidaysBetween(ctx, family, today, addDays(today, span));
    const out = [];
    for (const h of list) {
      const skip = await skipOn(ctx, viewer.member.familyId, h.date);
      out.push({ ...h, skip: skip ? { skipId: skip._id, status: skip.status } : null });
    }
    return out;
  },
});

export const question = query({
  ...pick(API.holidays.question),
  handler: async (ctx, { skipId }) => {
    const viewer = await requireViewer(ctx);
    return requireSkipForAdult(ctx, viewer.member, skipId);
  },
});

export const answer = mutation({
  ...pick(API.holidays.answer),
  handler: async (ctx, { skipId, action }) => {
    const viewer = await requireViewer(ctx);
    const skip = await requireSkipForAdult(ctx, viewer.member, skipId);
    return answerHoliday(ctx, { skip, adult: viewer.member, action, now: await clock.now(ctx, viewer.member.familyId) });
  },
});

// ---------- the cache (weekly cron + on demand from the GD tick) ----------

export const refreshTargets = internalQuery({
  args: { familyId: v.id('families') },
  returns: v.union(v.object({ country: v.string(), years: v.array(v.number()) }), v.null()),
  handler: async (ctx, { familyId }) => {
    const family = await ctx.db.get(familyId);
    if (!family) return null;
    return { country: familyCountry(family), years: yearsInView(await clock.now(ctx, familyId), family.timezone) };
  },
});

export const storeHolidays = internalMutation({
  args: {
    familyId: v.id('families'),
    country: v.string(),
    year: v.number(),
    result: v.union(v.object({ ok: v.literal(true), list: v.array(holiday) }), v.object({ ok: v.literal(false), failure: integrationFailure })),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (!(await ctx.db.get(a.familyId))) return null;
    await storeYear(ctx, { ...a, now: await clock.now(ctx, a.familyId) });
    return null;
  },
});

/** Fetches this year and next for one family's country. */
export const refreshFamily = internalAction({
  args: { familyId: v.id('families') },
  returns: v.null(),
  handler: async (ctx, { familyId }) => {
    const t = await ctx.runQuery(internal.holidays.refreshTargets, { familyId });
    if (!t) return null;
    for (const year of t.years) {
      const r = await getHolidays().list({ year, country: t.country });
      await ctx.runMutation(internal.holidays.storeHolidays, { familyId, country: t.country, year, result: r.ok ? { ok: true as const, list: r.holidays } : { ok: false as const, failure: r.failure } });
    }
    return null;
  },
});

export const refreshAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const familyIds: Id<'families'>[] = await ctx.runQuery(internal.weather.familyIds, {});
    for (const familyId of familyIds) await ctx.scheduler.runAfter(0, internal.holidays.refreshFamily, { familyId });
    return null;
  },
});
