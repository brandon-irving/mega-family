/// <reference types="vite/client" />
// G4 travel (docs/gates/G4.md backend task 6, invariants 6 and 7): leave-by checks for upcoming events at a saved
// place; reminders only to the adults in `who` (the owner only, for a private event); travel follows event
// visibility; without MAPBOX_TOKEN everything says "not set up" and nothing invents minutes.
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeFakeDirections } from './adapters/fakeDirections';
import { __setDirectionsForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';
const MIN = 60_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  __setDirectionsForTests(null);
  vi.useRealTimers();
});

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const now = (await as('admin').query(api.clock.get, {})).now;
  const events = () => t.run((ctx) => ctx.db.query('events').withIndex('by_family_start', (q) => q.eq('familyId', familyId)).collect());
  const todayPickup = async () => (await events()).find((e) => e.title === 'Soccer pickup' && e.start > now && e.start < now + 60 * MIN)!;
  const leaveBy = () => t.run(async (ctx) => (await ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect()).filter((c) => c.source?.kind === 'leaveBy'));
  return { t, familyId, m, as, now, events, todayPickup, leaveBy };
}

describe('leave-by checks', () => {
  test("today's soccer pickup gets a traffic check and one leave-by reminder for the adult going", async () => {
    const { t, familyId, m, as, todayPickup, leaveBy } = await seeded();
    const fake = makeFakeDirections(() => ({ ok: true, minutes: 18, typicalMinutes: 14, distanceMeters: 6400 }));
    __setDirectionsForTests(fake);
    await t.action(internal.travel.checkFamily, { familyId });
    const pickup = await todayPickup();
    expect(fake.requests[0]).toMatchObject({ from: { lat: 40.674, lng: -73.97 }, to: { lat: 40.6497, lng: -73.9682 } });

    const view = (await as('admin').query(api.travel.forEvent, { eventId: pickup._id }))!;
    expect(view).toMatchObject({ minutes: 18, typicalMinutes: 14, from: { label: 'Home' }, to: { label: 'Soccer field' } });
    expect(view.leaveBy).toBe(pickup.start - 18 * MIN - 10 * MIN);

    const reminders = await leaveBy();
    expect(reminders.map((c) => c.recipientId)).toEqual([m.admin]);
    expect(reminders[0]).toMatchObject({ kind: 'reminder', delivery: 'push' });
    expect(reminders[0].draft.text).toMatch(/18 min/);
  });

  test('a later check re-times the same reminder instead of adding a second one', async () => {
    const { t, familyId, leaveBy } = await seeded();
    let minutes = 18;
    __setDirectionsForTests(makeFakeDirections(() => ({ ok: true, minutes, distanceMeters: 6400 })));
    await t.action(internal.travel.checkFamily, { familyId });
    minutes = 25;
    await t.action(internal.travel.checkFamily, { familyId, force: true });
    const reminders = await leaveBy();
    expect(reminders.length).toBe(1);
    expect(reminders[0].draft.text).toMatch(/25 min/);
    const latest = await t.run((ctx) => ctx.db.get((reminders[0].source as { checkId: Id<'travelChecks'> }).checkId));
    expect(latest!.minutes).toBe(25);
  });

  test('kids are never told to leave: a kids-only event gets a check but no reminder', async () => {
    const { t, familyId, leaveBy, m } = await seeded();
    __setDirectionsForTests(makeFakeDirections());
    await t.action(internal.travel.checkFamily, { familyId });
    for (const c of await leaveBy()) expect([m.twin1, m.twin2]).not.toContain(c.recipientId);
  });

  test('a trip shorter than TRAVEL.minTripMinutes gets no reminder', async () => {
    const { t, familyId, leaveBy } = await seeded();
    __setDirectionsForTests(makeFakeDirections(() => ({ ok: true, minutes: 3, distanceMeters: 400 })));
    await t.action(internal.travel.checkFamily, { familyId });
    expect(await leaveBy()).toEqual([]);
  });
});

describe('G4 invariant 6: travel follows event visibility', () => {
  test("a private event's travel check and reminder belong to its owner only", async () => {
    const { t, familyId, m, as, now, leaveBy } = await seeded();
    __setDirectionsForTests(makeFakeDirections());
    const field = (await as('partner').query(api.places.list, {})).find((p) => p.label === 'Soccer field')!;
    const privateId = await as('partner').mutation(api.events.create, { title: 'Run', start: now + 3 * 60 * MIN, end: now + 4 * 60 * MIN, who: [m.partner, m.admin], scope: 'personal', placeId: field._id });
    await t.action(internal.travel.checkFamily, { familyId });
    expect((await leaveBy()).filter((c) => (c.source as { eventId: string }).eventId === privateId).map((c) => c.recipientId)).toEqual([m.partner]);
    expect(await as('partner').query(api.travel.forEvent, { eventId: privateId })).not.toBeNull();
    for (const k of ['admin', 'twin1'] as const) {
      let code: string | undefined;
      try {
        await as(k).query(api.travel.forEvent, { eventId: privateId });
      } catch (e) {
        code = codeOf(e);
      }
      expect(code, k).toBe('NOT_FOUND');
    }
  });
});

describe('G4 invariant 7: fail closed, never made up', () => {
  test('without MAPBOX_TOKEN the check records not_configured, the view says so, and nobody is reminded', async () => {
    const { t, familyId, as, todayPickup, leaveBy } = await seeded();
    __setDirectionsForTests(makeFakeDirections(() => ({ ok: false, failure: 'not_configured' })));
    await t.action(internal.travel.checkFamily, { familyId });
    const view = (await as('admin').query(api.travel.forEvent, { eventId: (await todayPickup())._id }))!;
    expect(view).toMatchObject({ failure: 'not_configured', minutes: null, leaveBy: null });
    expect(await leaveBy()).toEqual([]);
  });

  test('an event with no saved place reports noPlace', async () => {
    const { as, events } = await seeded();
    const dentist = (await events()).find((e) => e.title === 'Dentist')!;
    expect(await as('admin').query(api.travel.forEvent, { eventId: dentist._id })).toMatchObject({ failure: 'noPlace', minutes: null });
  });
});
