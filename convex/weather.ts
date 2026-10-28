// CONTRACT §4 `weather.*` (G4, v0.15) and the weather poll. `weather.get` reads the cache only (a query can't
// call out); `weather.refresh` and the cron (WEATHER.alertsPollMinutes) fetch through the Weather port
// (Open-Meteo + NWS) and write the cache, which also runs the two weather triggers (convex/model/weather.ts).
import { v } from 'convex/values';
import { WEATHER } from '../shared/config/integrations';
import { integrationFailure } from '../shared/domain/tables';
import { API } from '../shared/domain/api';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type QueryCtx } from './_generated/server';
import { getWeather } from './adapters/registry';
import { pick } from './model/define';
import { homePlace, isGeocoded, requireFamilyPlace } from './model/places';
import { alertTriggers, buildWeatherView, cacheIsStale, eventWeatherTriggers, writeCache, type AlertsData, type ForecastData } from './model/weather';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

const HOUR = 3_600_000;

async function placeFor(ctx: QueryCtx, familyId: Id<'families'>, placeId: Id<'places'> | undefined) {
  return placeId ? requireFamilyPlace(ctx, familyId, placeId) : homePlace(ctx, familyId);
}

export const get = query({
  ...pick(API.weather.get),
  handler: async (ctx, { placeId }) => {
    const viewer = await requireViewer(ctx);
    const place = await placeFor(ctx, viewer.member.familyId, placeId);
    if (!place || !isGeocoded(place)) return null;
    return buildWeatherView(ctx, place, viewer.family.timezone, await clock.now(ctx, viewer.member.familyId));
  },
});

export const refresh = mutation({
  ...pick(API.weather.refresh),
  handler: async (ctx, { placeId }) => {
    const viewer = await requireViewer(ctx);
    const familyId = viewer.member.familyId;
    const place = await placeFor(ctx, familyId, placeId);
    if (!place || !isGeocoded(place)) return { queued: false };
    const now = await clock.now(ctx, familyId);
    if (!(await cacheIsStale(ctx, familyId, place._id, 'forecast', now))) return { queued: false };
    await ctx.scheduler.runAfter(0, internal.weather.fetchPlace, { placeId: place._id });
    return { queued: true };
  },
});

// ---------- fetching ----------

const target = v.object({ placeId: v.id('places'), lat: v.number(), lng: v.number(), forecast: v.boolean(), alerts: v.boolean() });

/** What a poll should fetch for a family: its home, plus every place with an event coming up within
 * WEATHER.eventLookaheadHours; each kind only when stale (or always, with `force`). */
export const pollTargets = internalQuery({
  args: { familyId: v.id('families'), placeId: v.optional(v.id('places')), force: v.boolean() },
  returns: v.object({ tz: v.string(), targets: v.array(target) }),
  handler: async (ctx, { familyId, placeId, force }) => {
    const family = await ctx.db.get(familyId);
    if (!family) return { tz: 'UTC', targets: [] };
    const now = await clock.now(ctx, familyId);
    const ids = new Set<Id<'places'>>();
    if (placeId) ids.add(placeId);
    else {
      const home = await homePlace(ctx, familyId);
      if (home) ids.add(home._id);
      const soon = await ctx.db
        .query('events')
        .withIndex('by_family_start', (q) => q.eq('familyId', familyId).gte('start', now).lte('start', now + WEATHER.eventLookaheadHours * HOUR))
        .collect();
      for (const e of soon) if (!e.cancelled && e.placeId) ids.add(e.placeId);
    }
    const targets = [];
    for (const id of ids) {
      const place = await ctx.db.get(id);
      if (!place || place.familyId !== familyId || !isGeocoded(place)) continue;
      const forecast = force || (await cacheIsStale(ctx, familyId, id, 'forecast', now));
      const alerts = force || (await cacheIsStale(ctx, familyId, id, 'alerts', now));
      if (forecast || alerts) targets.push({ placeId: id, lat: place.lat, lng: place.lng, forecast, alerts });
    }
    return { tz: family.timezone, targets };
  },
});

const fetched = v.union(v.object({ ok: v.literal(true), data: v.any() }), v.object({ ok: v.literal(false), failure: integrationFailure }));

/** Writes what a poll fetched for one place and runs the weather triggers on it. */
export const store = internalMutation({
  args: { placeId: v.id('places'), forecast: v.optional(fetched), alerts: v.optional(fetched) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const place = await ctx.db.get(args.placeId);
    if (!place) return null;
    const family = await ctx.db.get(place.familyId);
    if (!family) return null;
    const now = await clock.now(ctx, place.familyId);
    if (args.forecast) {
      await writeCache(ctx, { familyId: place.familyId, placeId: place._id, kind: 'forecast', now, result: args.forecast });
      if (args.forecast.ok) await eventWeatherTriggers(ctx, { familyId: place.familyId, place, tz: family.timezone, hours: (args.forecast.data as ForecastData).hours, now });
    }
    if (args.alerts) {
      await writeCache(ctx, { familyId: place.familyId, placeId: place._id, kind: 'alerts', now, result: args.alerts });
      if (args.alerts.ok) await alertTriggers(ctx, { familyId: place.familyId, place, alerts: (args.alerts.data as AlertsData).alerts, now });
    }
    return null;
  },
});

async function pollOne(ctx: ActionCtx, familyId: Id<'families'>, placeId: Id<'places'> | undefined, force: boolean) {
  const { tz, targets } = await ctx.runQuery(internal.weather.pollTargets, { familyId, placeId, force });
  await fetchTargets(ctx, tz, targets);
}

async function fetchTargets(ctx: ActionCtx, tz: string, targets: { placeId: Id<'places'>; lat: number; lng: number; forecast: boolean; alerts: boolean }[]) {
  const weather = getWeather();
  for (const t of targets) {
    const [forecast, alerts] = await Promise.all([
      t.forecast ? weather.forecast({ lat: t.lat, lng: t.lng, timezone: tz, days: WEATHER.forecastDays }) : Promise.resolve(null),
      t.alerts ? weather.alerts({ lat: t.lat, lng: t.lng }) : Promise.resolve(null),
    ]);
    await ctx.runMutation(internal.weather.store, {
      placeId: t.placeId,
      forecast: forecast ? (forecast.ok ? { ok: true as const, data: { current: forecast.current, hours: forecast.hours, days: forecast.days } } : { ok: false as const, failure: forecast.failure }) : undefined,
      alerts: alerts ? (alerts.ok ? { ok: true as const, data: { alerts: alerts.alerts } } : { ok: false as const, failure: alerts.failure }) : undefined,
    });
  }
}

/** `weather.refresh` → one place, both kinds. */
export const fetchPlace = internalAction({
  args: { placeId: v.id('places') },
  returns: v.null(),
  handler: async (ctx, { placeId }) => {
    const familyId = await ctx.runQuery(internal.weather.familyOfPlace, { placeId });
    if (familyId) await pollOne(ctx, familyId, placeId, true);
    return null;
  },
});

export const familyOfPlace = internalQuery({
  args: { placeId: v.id('places') },
  returns: v.union(v.id('families'), v.null()),
  handler: async (ctx, { placeId }) => (await ctx.db.get(placeId))?.familyId ?? null,
});

/** One family's poll (the cron calls it per family; tests and `seed.resetDemo` call it directly). */
export const pollFamily = internalAction({
  args: { familyId: v.id('families'), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { familyId, force }) => {
    await pollOne(ctx, familyId, undefined, !!force);
    return null;
  },
});

export const familyIds = internalQuery({
  args: {},
  returns: v.array(v.id('families')),
  handler: async (ctx) => (await ctx.db.query('families').take(500)).map((f) => f._id),
});

/** The cron (WEATHER.alertsPollMinutes): every family's poll, each scheduled separately so one slow provider
 * call can't hold up the others. */
export const pollAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const familyId of await ctx.runQuery(internal.weather.familyIds, {})) await ctx.scheduler.runAfter(0, internal.weather.pollFamily, { familyId });
    return null;
  },
});
