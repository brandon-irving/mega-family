/// <reference types="vite/client" />
// G4 weather (docs/gates/G4.md backend task 5, invariants 7 and 8): `weather.get` builds its view from the
// cache only; `weather.refresh` and the poll fetch through the Weather port; NWS alerts become one candidate per
// (alert × adult) with severity rules; rain at an upcoming event becomes a tip; nothing is ever made up.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeFakeChatModel, textReply } from './adapters/fakeChatModel';
import { makeFakeWeather } from './adapters/fakeWeather';
import { __setChatModelForTests, __setWeatherForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import type { WeatherAlert } from './ports/weather';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';
const HOUR = 3_600_000;

beforeEach(() => vi.useFakeTimers());
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
  const candidates = () => t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect());
  return { t, familyId, m, as, now, candidates };
}

/** Hourly forecast around `now`: dry except `wetHour` (0 = the hour containing now). */
function forecastAround(now: number, wetHour?: number) {
  const start = Math.floor(now / HOUR) * HOUR;
  const hours = Array.from({ length: 24 }, (_, i) => ({ at: start + i * HOUR, tempF: 55 + i, precipPct: i === wetHour ? 80 : 5, code: i === wetHour ? 61 : 2 }));
  return { ok: true as const, hours, days: [{ date: '2026-10-25', highF: 61, lowF: 48, precipPct: wetHour === undefined ? 5 : 80, code: 61 }] };
}

const alert = (over: Partial<WeatherAlert> = {}): WeatherAlert => ({ id: 'urn:nws:1', event: 'Wind Advisory', headline: 'Wind Advisory until 9 PM', severity: 'Severe', ...over });

describe('weather.get / weather.refresh', () => {
  test('before any fetch the view is honest: no numbers, stale', async () => {
    const { as } = await seeded();
    const view = await as('twin1').query(api.weather.get, {});
    expect(view).not.toBeNull();
    expect(view!.placeLabel).toBe('Home');
    expect(view!.now).toBeNull();
    expect(view!.hours).toEqual([]);
    expect(view!.stale).toBe(true);
  });

  test('refresh fetches through the Weather port for the home place; the view then has now, next hours and today', async () => {
    const { t, as, now } = await seeded();
    const fake = makeFakeWeather({ forecast: () => forecastAround(now) });
    __setWeatherForTests(fake);
    expect((await as('partner').mutation(api.weather.refresh, {})).queued).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.forecasts[0]).toMatchObject({ lat: 40.674, lng: -73.97, timezone: 'America/New_York' });
    const view = (await as('partner').query(api.weather.get, {}))!;
    expect(view.stale).toBe(false);
    expect(view.now?.summary).toBe('Partly cloudy');
    expect(view.hours.length).toBe(6);
    expect(view.today).toMatchObject({ highF: 61, lowF: 48 });
    // within the TTL a second refresh does nothing
    expect((await as('partner').mutation(api.weather.refresh, {})).queued).toBe(false);
  });

  test("when the family's (demo) clock is outside the forecast, the view follows the forecast's own now, not the wrong day", async () => {
    const { t, as, now } = await seeded();
    const realNow = now + 3 * 24 * 3_600_000; // the demo clock is days behind the real forecast
    const start = Math.floor(realNow / 3_600_000) * 3_600_000;
    __setWeatherForTests(
      makeFakeWeather({
        forecast: () => ({
          ok: true,
          current: { at: realNow, tempF: 61, code: 3 },
          hours: Array.from({ length: 24 }, (_, i) => ({ at: start - 2 * 3_600_000 + i * 3_600_000, tempF: 40 + i, precipPct: 0, code: 2 })),
          days: [{ date: '2026-10-28', highF: 63, lowF: 44, precipPct: 0, code: 3 }],
        }),
      }),
    );
    await as('admin').mutation(api.weather.refresh, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const view = (await as('admin').query(api.weather.get, {}))!;
    expect(view.now?.tempF).toBe(61);
    expect(view.hours[0].at).toBe(start); // the hour of the forecast's now, not the first hour of the day
    expect(view.today).toMatchObject({ highF: 63 });
  });

  test('a provider failure is a failure, never invented numbers', async () => {
    const { t, as } = await seeded();
    __setWeatherForTests(makeFakeWeather({ forecast: () => ({ ok: false, failure: 'error' }), alerts: () => ({ ok: false, failure: 'error' }) }));
    await as('admin').mutation(api.weather.refresh, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const view = (await as('admin').query(api.weather.get, {}))!;
    expect(view.failure).toBe('error');
    expect(view.now).toBeNull();
  });
});

describe('G4 invariant 8: alerts do not spam', () => {
  test('a Severe alert reaches each adult once (kids never), pushed as time-sensitive; polling again adds nothing', async () => {
    const { t, familyId, m, now, candidates } = await seeded();
    __setWeatherForTests(makeFakeWeather({ forecast: () => forecastAround(now), alerts: () => ({ ok: true, alerts: [alert()] }) }));
    await t.action(internal.weather.pollFamily, { familyId });
    await t.action(internal.weather.pollFamily, { familyId, force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const alerts = (await candidates()).filter((c) => c.source?.kind === 'weatherAlert');
    expect(alerts.map((c) => c.recipientId).sort()).toEqual([m.admin, m.partner].sort());
    expect(alerts.every((c) => c.delivery === 'push')).toBe(true);
    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    const alertNotes = notes.filter((n) => alerts.some((c) => c._id === n.candidateId));
    expect(alertNotes.length).toBe(2);
    expect(alertNotes.every((n) => n.loudness === 'timeSensitive')).toBe(true);
    const logged = await t.run((ctx) => ctx.db.query('familyEvents').withIndex('by_family_at', (q) => q.eq('familyId', familyId)).collect());
    expect(logged.filter((e) => e.type === 'weather.alert').length).toBe(1);
  });

  test('Moderate is a quiet statement; Minor and Unknown are dropped', async () => {
    const { t, familyId, now, candidates } = await seeded();
    __setWeatherForTests(
      makeFakeWeather({
        forecast: () => forecastAround(now),
        alerts: () => ({ ok: true, alerts: [alert({ id: 'urn:mod', severity: 'Moderate' }), alert({ id: 'urn:minor', severity: 'Minor' }), alert({ id: 'urn:unk', severity: 'Unknown' })] }),
      }),
    );
    await t.action(internal.weather.pollFamily, { familyId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const alerts = (await candidates()).filter((c) => c.source?.kind === 'weatherAlert');
    expect(new Set(alerts.map((c) => (c.source as { alertId: string }).alertId))).toEqual(new Set(['urn:mod']));
    expect(alerts.every((c) => c.delivery === 'statement')).toBe(true);
  });

  test('an alert that ended before delivery is cancelled, not sent', async () => {
    const { t, familyId, now, candidates } = await seeded();
    let active = true;
    __setWeatherForTests(makeFakeWeather({ forecast: () => forecastAround(now), alerts: () => ({ ok: true, alerts: active ? [alert()] : [] }) }));
    await t.action(internal.weather.pollFamily, { familyId });
    active = false;
    await t.action(internal.weather.pollFamily, { familyId, force: true }); // the alert is gone from NWS now
    // deliver whatever is scheduled
    for (const c of (await candidates()).filter((c) => c.status === 'scheduled')) await t.mutation(internal.proactive.deliverCandidate, { candidateId: c._id });
    const alerts = (await candidates()).filter((c) => c.source?.kind === 'weatherAlert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((c) => c.status === 'cancelled')).toBe(true);
  });
});

describe('rain at an upcoming event', () => {
  test("rain at today's soccer pickup becomes one drafted tip for the adult who's going", async () => {
    const { t, familyId, m, now, candidates } = await seeded();
    __setChatModelForTests(makeFakeChatModel(() => textReply(JSON.stringify({ kind: 'tip', title: 'Rain at pickup', text: 'Rain is likely at soccer pickup. Grab the umbrellas.', score: 0.9, reason: 'rain' }))));
    __setWeatherForTests(makeFakeWeather({ forecast: () => forecastAround(now, 0), alerts: () => ({ ok: true, alerts: [] }) }));
    await t.action(internal.weather.pollFamily, { familyId });
    await t.action(internal.weather.pollFamily, { familyId, force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const tips = (await candidates()).filter((c) => c.source?.kind === 'weatherEvent');
    expect(tips.length).toBe(1);
    expect(tips[0].recipientId).toBe(m.admin); // today's "Soccer pickup" is Admin's
    expect(tips[0].kind).toBe('tip');
  });
});
