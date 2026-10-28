/// <reference types="vite/client" />
// G4 invariant 5 (docs/gates/G4.md): places are household data — every member reads them, only adults edit,
// at most one home, limits from PLACES — plus geocoding in the background (pending → ok / not_configured) and
// events linking to a saved place (`placeId`, same family only).
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeFakeGeocoder } from './adapters/fakeGeocoder';
import { __setGeocoderForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  __setGeocoderForTests(null);
  vi.useRealTimers();
});

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);
async function expectCode(p: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(codeOf(caught)).toBe(code);
}

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  return { t, familyId, m, as };
}

describe('G4 invariant 5: places are household data; adults edit', () => {
  test('every member (kids too) lists the family places, home first', async () => {
    const { as } = await seeded();
    for (const k of ['admin', 'partner', 'twin1'] as const) {
      const places = await as(k).query(api.places.list, {});
      expect(places.map((p) => p.kind).slice(0, 3), k).toEqual(['home', 'school', 'work']);
      expect(places.map((p) => p.label)).toContain('Soccer field');
    }
  });

  test('a kid can neither add, edit nor remove a place', async () => {
    const { as } = await seeded();
    const home = (await as('admin').query(api.places.list, {}))[0];
    await expectCode(as('twin1').mutation(api.places.upsert, { kind: 'other', label: 'Park', address: 'Prospect Park, Brooklyn' }), 'FORBIDDEN');
    await expectCode(as('twin1').mutation(api.places.upsert, { placeId: home._id, kind: 'home', label: 'Home', address: 'Elsewhere' }), 'FORBIDDEN');
    await expectCode(as('twin1').mutation(api.places.remove, { placeId: home._id }), 'FORBIDDEN');
  });

  test('an adult adds a place; it geocodes in the background (pending → ok)', async () => {
    const { t, as } = await seeded();
    __setGeocoderForTests(makeFakeGeocoder());
    const id = await as('partner').mutation(api.places.upsert, { kind: 'other', label: 'Library', address: 'Central Library, Grand Army Plaza, Brooklyn' });
    let place = (await as('partner').query(api.places.list, {})).find((p) => p._id === id)!;
    expect(place.geocode.status).toBe('pending');
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    place = (await as('partner').query(api.places.list, {})).find((p) => p._id === id)!;
    expect(place.geocode.status).toBe('ok');
    expect(typeof place.lat).toBe('number');
  });

  test('without MAPBOX_TOKEN geocoding fails closed: not_configured, no coordinates', async () => {
    const { t, as } = await seeded();
    __setGeocoderForTests(makeFakeGeocoder(() => ({ ok: false, failure: 'not_configured' })));
    const id = await as('admin').mutation(api.places.upsert, { kind: 'other', label: 'Library', address: 'Central Library, Brooklyn' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const place = (await as('admin').query(api.places.list, {})).find((p) => p._id === id)!;
    expect(place.geocode.status).toBe('not_configured');
    expect(place.lat).toBeUndefined();
  });

  test('a changed address resets geocoding; the label alone does not', async () => {
    const { t, as } = await seeded();
    __setGeocoderForTests(makeFakeGeocoder());
    const school = (await as('admin').query(api.places.list, {})).find((p) => p.kind === 'school')!;
    await as('admin').mutation(api.places.upsert, { placeId: school._id, kind: 'school', label: 'Big school', address: school.address });
    expect((await t.run((ctx) => ctx.db.get(school._id)))!.geocode.status).toBe('seed');
    await as('admin').mutation(api.places.upsert, { placeId: school._id, kind: 'school', label: 'Big school', address: 'Another address, Brooklyn' });
    expect((await t.run((ctx) => ctx.db.get(school._id)))!.geocode.status).toBe('pending');
  });

  test('only one home; empty or overlong fields are VALIDATION', async () => {
    const { as } = await seeded();
    await expectCode(as('admin').mutation(api.places.upsert, { kind: 'home', label: 'Cabin', address: 'Somewhere' }), 'VALIDATION');
    await expectCode(as('admin').mutation(api.places.upsert, { kind: 'other', label: ' ', address: 'Somewhere' }), 'VALIDATION');
    await expectCode(as('admin').mutation(api.places.upsert, { kind: 'other', label: 'x'.repeat(41), address: 'Somewhere' }), 'VALIDATION');
  });

  test('removing a place clears it from events (they keep their free-text place)', async () => {
    const { t, familyId, as } = await seeded();
    const field = (await as('admin').query(api.places.list, {})).find((p) => p.label === 'Soccer field')!;
    const linked = () => t.run(async (ctx) => (await ctx.db.query('events').withIndex('by_family_start', (q) => q.eq('familyId', familyId)).collect()).filter((e) => e.placeId === field._id));
    expect((await linked()).length).toBeGreaterThan(0); // the seed links soccer to the field
    await as('admin').mutation(api.places.remove, { placeId: field._id });
    expect(await linked()).toEqual([]);
  });

  test("events take a placeId from the caller's own family only", async () => {
    const { t, as, m } = await seeded();
    const foreign = await t.run(async (ctx) => {
      const otherFamily = await ctx.db.insert('families', { name: 'Other', timezone: 'America/New_York', parentCode: '00000', createdAt: 0 });
      return { _id: await ctx.db.insert('places', { familyId: otherFamily, kind: 'home', label: 'Home', address: 'Elsewhere', geocode: { status: 'seed' }, createdBy: m.admin, updatedAt: 0 }) };
    });
    await expectCode(as('admin').mutation(api.events.create, { title: 'X', start: Date.parse('2026-10-27T15:00:00Z'), who: [m.admin], scope: 'family', placeId: foreign._id }), 'NOT_FOUND');
    const home = (await as('admin').query(api.places.list, {}))[0];
    const id = await as('admin').mutation(api.events.create, { title: 'Y', start: Date.parse('2026-10-27T15:00:00Z'), who: [m.admin], scope: 'family', placeId: home._id });
    expect((await t.run((ctx) => ctx.db.get(id)))!.placeId).toBe(home._id);
  });
});
