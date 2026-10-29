/// <reference types="vite/client" />
// G4b air quality and UV (docs/gates/G4b.md invariants 7 and 8, backend task 6): the forecast's `air` reaches
// `weather.get` from the cache only; an event at an OUTDOOR place with high UV or poor air at its start gets one
// deterministic tip per event × tip × recipient × day, as a `weather` card with the numbers; never for kids,
// never at an indoor place, never a guessed number.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WEATHER } from '../shared/config/integrations';
import { makeFakeChatModel, textReply } from './adapters/fakeChatModel';
import { makeFakeWeather } from './adapters/fakeWeather';
import { __setChatModelForTests, __setWeatherForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import type { WeatherAir } from './ports/weather';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';
const HOUR = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers();
  __setChatModelForTests(makeFakeChatModel(() => textReply(JSON.stringify({ kind: 'tip', title: 'x', text: 'x', score: 0, reason: 'x' }))));
});
afterEach(() => {
  __setWeatherForTests(null);
  __setChatModelForTests(null);
  vi.useRealTimers();
});

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const now = (await as('admin').query(api.clock.get, {})).now;
  const tips = async () => (await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect())).filter((c) => c.source?.kind === 'weatherEvent' && c.source.tip);
  const weatherCards = (k: Key) =>
    t.run(async (ctx) => {
      const thread = await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m[k])).unique();
      if (!thread) return [];
      const msgs = await ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id)).collect();
      return msgs.flatMap((x) => (x.body.type === 'card' && x.body.card.kind === 'weather' ? [x.body.card] : []));
    });
  const pickup = (await t.run((ctx) => ctx.db.query('events').withIndex('by_family_start', (q) => q.eq('familyId', familyId)).collect())).find((e) => e.title === 'Soccer pickup')!;
  return { t, familyId, m, as, now, tips, weatherCards, pickup };
}

/** A dry forecast around `now` with air quality: `uv` and `aqi` at every hour (or per hour via functions). */
function forecastWithAir(now: number, air: { uv: number; aqi: number } | null) {
  const start = Math.floor(now / HOUR) * HOUR;
  const hours = Array.from({ length: 24 }, (_, i) => ({ at: start + i * HOUR, tempF: 70, precipPct: 5, code: 1 }));
  const a: WeatherAir | undefined = air ? { usAqi: air.aqi, uvIndex: air.uv, uvIndexMax: air.uv, hourly: hours.map((h) => ({ at: h.at, usAqi: air.aqi, uv: air.uv })) } : undefined;
  return { ok: true as const, hours, days: [{ date: '2026-10-25', highF: 75, lowF: 60, precipPct: 5, code: 1 }], ...(a ? { air: a } : {}) };
}

async function poll(s: Awaited<ReturnType<typeof seeded>>, air: { uv: number; aqi: number } | null) {
  __setWeatherForTests(makeFakeWeather({ forecast: () => forecastWithAir(s.now, air), alerts: () => ({ ok: true, alerts: [] }) }));
  await s.t.action(internal.weather.pollFamily, { familyId: s.familyId, force: true });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe('weather.get: air from the cache', () => {
  test('AQI and UV now and today’s peak UV come only from the provider; no air call → no air row', async () => {
    const s = await seeded();
    await poll(s, { uv: 4.2, aqi: 62 });
    expect((await s.as('twin1').query(api.weather.get, {}))!.air).toEqual({ usAqi: 62, uvIndex: 4.2, uvIndexMax: 4.2 });
    await poll(s, null);
    expect((await s.as('twin1').query(api.weather.get, {}))!.air).toBeUndefined();
  });
});

describe('invariant 8: air and UV tips are outdoor-only and deduped', () => {
  test('high UV and poor air at soccer pickup (outdoor) → one uv and one air tip for Admin, each a weather card with the numbers', async () => {
    const s = await seeded();
    await poll(s, { uv: 8, aqi: 132 });
    const forPickup = (await s.tips()).filter((c) => c.source?.kind === 'weatherEvent' && c.source.eventId === s.pickup._id);
    expect(forPickup.map((c) => [c.recipientId, (c.source as { tip?: string }).tip]).sort()).toEqual([
      [s.m.admin, 'air'],
      [s.m.admin, 'uv'],
    ]);
    // AQI 132 is below WEATHER.airTipPushMinAqi and UV never pushes: both quiet statements.
    expect(forPickup.every((c) => c.delivery === 'statement')).toBe(true);
    const cards = (await s.weatherCards('admin')).filter((c) => c.eventId === s.pickup._id);
    expect(cards.map((c) => [c.tip, c.air?.uvAt, c.air?.usAqi, c.placeLabel]).sort()).toEqual([
      ['air', 8, 132, 'Soccer field'],
      ['uv', 8, 132, 'Soccer field'],
    ]);
    expect(cards.find((c) => c.tip === 'uv')!.summary).toBe('UV is high during Soccer pickup. Pack sunscreen.');

    await poll(s, { uv: 9, aqi: 140 }); // the same day: deduped
    expect((await s.tips()).filter((c) => c.source?.kind === 'weatherEvent' && c.source.eventId === s.pickup._id).length).toBe(2);
    // Never a kid (Twin 1 and Twin 2 are in "Soccer practice ends"; their parents hear instead).
    expect((await s.tips()).some((c) => c.recipientId === s.m.twin1 || c.recipientId === s.m.twin2)).toBe(false);
  });

  test(`an air tip at AQI ≥ WEATHER.airTipPushMinAqi (${WEATHER.airTipPushMinAqi}) is a push`, async () => {
    const s = await seeded();
    await poll(s, { uv: 1, aqi: 165 });
    const air = (await s.tips()).filter((c) => c.source?.kind === 'weatherEvent' && c.source.tip === 'air' && c.source.eventId === s.pickup._id);
    expect(air.length).toBe(1);
    expect(air[0].delivery).toBe('push');
    expect((await s.tips()).some((c) => c.source?.kind === 'weatherEvent' && c.source.tip === 'uv')).toBe(false);
  });

  test('the same numbers at an indoor place → no tip; below the thresholds → no tip', async () => {
    const s = await seeded();
    await s.t.run(async (ctx) => {
      const place = (await ctx.db.get(s.pickup.placeId!))!;
      await ctx.db.patch(place._id, { outdoor: false });
    });
    await poll(s, { uv: 10, aqi: 200 });
    expect(await s.tips()).toEqual([]);

    const s2 = await seeded();
    await poll(s2, { uv: WEATHER.uvTipMin - 1, aqi: WEATHER.aqiTipMin - 1 });
    expect(await s2.tips()).toEqual([]);
  });

  test('places.upsert stores `outdoor` (omitted keeps it)', async () => {
    const s = await seeded();
    const placeId = s.pickup.placeId!;
    const place = (await s.t.run((ctx) => ctx.db.get(placeId)))!;
    await s.as('admin').mutation(api.places.upsert, { placeId, kind: place.kind, label: place.label, address: place.address, outdoor: false });
    expect((await s.t.run((ctx) => ctx.db.get(placeId)))!.outdoor).toBe(false);
    await s.as('admin').mutation(api.places.upsert, { placeId, kind: place.kind, label: 'Field', address: place.address });
    expect((await s.t.run((ctx) => ctx.db.get(placeId)))!.outdoor).toBe(false);
  });
});
