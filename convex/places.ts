// CONTRACT §4 `places.*` (G4, v0.15). Household data: every member of the family reads the list; adults
// (PLACES.editors) add, edit and remove. A new or changed address is geocoded in the background (Geocoder
// port → Mapbox, `permanent`), so the mutation never waits on the network and fails closed when MAPBOX_TOKEN
// isn't set (`geocode.status: 'not_configured'`, no coordinates).
import { v } from 'convex/values';
import { GEOCODING, PLACES } from '../shared/config/integrations';
import { API } from '../shared/domain/api';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { getGeocoder } from './adapters/registry';
import { pick } from './model/define';
import { fail } from './model/errors';
import { familyPlaces, homePlace, isGeocoded, requireFamilyPlace, validatePlaceFields } from './model/places';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

function requireEditor(role: string) {
  if (!(PLACES.editors as readonly string[]).includes(role)) fail('FORBIDDEN', 'only grown-ups can change places');
}

export const list = query({
  ...pick(API.places.list),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    return familyPlaces(ctx, viewer.member.familyId);
  },
});

export const upsert = mutation({
  ...pick(API.places.upsert),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireEditor(viewer.member.role);
    const familyId = viewer.member.familyId;
    const { label, address } = validatePlaceFields(args.label, args.address);
    const now = await clock.now(ctx, familyId);

    if (args.kind === 'home') {
      const home = await homePlace(ctx, familyId);
      if (home && home._id !== args.placeId) fail('VALIDATION', 'the family already has a home');
    }

    if (args.placeId) {
      const place = await requireFamilyPlace(ctx, familyId, args.placeId);
      const addressChanged = place.address !== address;
      await ctx.db.patch(place._id, {
        kind: args.kind,
        label,
        address,
        updatedAt: now,
        ...(addressChanged ? { lat: undefined, lng: undefined, geocode: { status: 'pending' as const } } : {}),
      });
      if (addressChanged) await ctx.scheduler.runAfter(0, internal.places.geocode, { placeId: place._id });
      return place._id;
    }

    if ((await familyPlaces(ctx, familyId)).length >= PLACES.maxPerFamily) fail('VALIDATION', `a family can save up to ${PLACES.maxPerFamily} places`);
    const placeId = await ctx.db.insert('places', { familyId, kind: args.kind, label, address, geocode: { status: 'pending' }, createdBy: viewer.member._id, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.places.geocode, { placeId });
    return placeId;
  },
});

export const remove = mutation({
  ...pick(API.places.remove),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireEditor(viewer.member.role);
    const place = await requireFamilyPlace(ctx, viewer.member.familyId, args.placeId);
    // Events keep their free-text `place`; only the link goes. The family's events are few enough to scan.
    const events = await ctx.db
      .query('events')
      .withIndex('by_family_start', (q) => q.eq('familyId', place.familyId))
      .collect();
    for (const e of events) if (e.placeId === place._id) await ctx.db.patch(e._id, { placeId: undefined });
    for (const row of await ctx.db
      .query('weatherCache')
      .withIndex('by_family_place_kind', (q) => q.eq('familyId', place.familyId).eq('placeId', place._id))
      .collect())
      await ctx.db.delete(row._id);
    await ctx.db.delete(place._id);
    return null;
  },
});

// ---------- background geocoding ----------

/** Cron (GEOCODING.retrySweepMinutes, G4 review): re-queues stuck lookups. `not_configured` every sweep (cheap:
 * no token means no network call, and adding MAPBOX_TOKEN heals them on the next sweep); `failed` once
 * GEOCODING.retryAfterHours have passed since the last try. Each family's own clock decides "now". */
export const retryGeocodes = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const stuck = (await ctx.db.query('places').take(GEOCODING.retryScanLimit)).filter((p) => p.geocode.status === 'failed' || p.geocode.status === 'not_configured');
    const nowByFamily = new Map<string, number>();
    let queued = 0;
    for (const place of stuck) {
      if (queued >= GEOCODING.retryPerSweep) break;
      if (place.geocode.status === 'failed') {
        if (!nowByFamily.has(place.familyId)) nowByFamily.set(place.familyId, await clock.now(ctx, place.familyId));
        const now = nowByFamily.get(place.familyId)!;
        if (place.geocode.at !== undefined && now - place.geocode.at < GEOCODING.retryAfterHours * 3_600_000) continue;
      }
      await ctx.db.patch(place._id, { geocode: { status: 'pending' } });
      await ctx.scheduler.runAfter(0, internal.places.geocode, { placeId: place._id });
      queued++;
    }
    return null;
  },
});

export const loadForGeocode = internalQuery({
  args: { placeId: v.id('places') },
  returns: v.union(v.object({ address: v.string(), proximity: v.union(v.object({ lat: v.number(), lng: v.number() }), v.null()) }), v.null()),
  handler: async (ctx, { placeId }) => {
    const place = await ctx.db.get(placeId);
    if (!place || place.geocode.status !== 'pending') return null;
    const home = await homePlace(ctx, place.familyId);
    return { address: place.address, proximity: home && home._id !== place._id && isGeocoded(home) ? { lat: home.lat, lng: home.lng } : null };
  },
});

export const storeGeocode = internalMutation({
  args: {
    placeId: v.id('places'),
    address: v.string(),
    result: v.union(v.object({ ok: v.literal(true), lat: v.number(), lng: v.number() }), v.object({ ok: v.literal(false), failure: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { placeId, address, result }) => {
    const place = await ctx.db.get(placeId);
    // The address changed again while we were out: that newer lookup owns the row.
    if (!place || place.address !== address || place.geocode.status !== 'pending') return null;
    const at = await clock.now(ctx, place.familyId);
    if (result.ok) await ctx.db.patch(placeId, { lat: result.lat, lng: result.lng, geocode: { status: 'ok', at } });
    else await ctx.db.patch(placeId, { geocode: { status: result.failure === 'not_configured' ? 'not_configured' : 'failed', at } });
    return null;
  },
});

export const geocode = internalAction({
  args: { placeId: v.id('places') },
  returns: v.null(),
  handler: async (ctx, { placeId }) => {
    const job = await ctx.runQuery(internal.places.loadForGeocode, { placeId });
    if (!job) return null;
    const r = await getGeocoder().geocode({ address: job.address, country: GEOCODING.country, proximity: job.proximity ?? undefined });
    await ctx.runMutation(internal.places.storeGeocode, {
      placeId,
      address: job.address,
      result: r.ok ? { ok: true, lat: r.lat, lng: r.lng } : { ok: false, failure: r.failure },
    });
    return null;
  },
});
