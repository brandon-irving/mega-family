/// <reference types="vite/client" />
// GD correctness review fixes for Hub's clash checker (convex/model/clashes.ts):
// - BLOCKER: an event already in progress (start < now < end) was never a candidate, so a new event that
//   overlaps it was never flagged.
// - HIGH: once any collision row existed for a pair (resolved, dismissed, stale), the pair could never be
//   flagged again even when it genuinely clashed again. A decided pair whose events haven't changed must
//   still not be re-flagged on every sweep (no spam).
// - MEDIUM: an all-day event saved without `end` overlapped nothing.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { detectClashes, overlapMs } from './model/clashes';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
const HOUR = 3_600_000;
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  // Far from the seed week, so the seed's own events can't interfere.
  const T0 = Date.UTC(2027, 2, 10, 15, 0);
  const add = (title: string, start: number, end: number | undefined, who: Id<'members'>[]) =>
    t.run((ctx) => ctx.db.insert('events', { familyId, title, start, end, who, source: 'mega', scope: 'family', cancelled: false }));
  const detect = (now: number) => t.run((ctx) => detectClashes(ctx, familyId, now));
  const collisionsFor = (a: Id<'events'>, b: Id<'events'>) =>
    t.run(async (ctx) =>
      (await ctx.db.query('collisions').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect()).filter(
        (c) => c.eventIds.includes(a) && c.eventIds.includes(b),
      ),
    );
  return { t, familyId, m, T0, add, detect, collisionsFor };
}

describe('clash checker: events already in progress', () => {
  test('a new event overlapping one that already started is flagged', async () => {
    const { m, T0, add, detect, collisionsFor } = await seeded();
    const soccer = await add('Soccer', T0, T0 + 2 * HOUR, [m.partner]);
    const dentist = await add('Dentist run', T0 + 1.5 * HOUR, T0 + 2.5 * HOUR, [m.partner]);
    await detect(T0 + HOUR); // soccer started an hour ago and is still going
    expect(await collisionsFor(soccer, dentist)).toHaveLength(1);
  });

  test('an event that already ended is not a candidate', async () => {
    const { m, T0, add, detect, collisionsFor } = await seeded();
    const a = await add('Done', T0, T0 + HOUR, [m.partner]);
    const b = await add('Also done', T0 + 0.5 * HOUR, T0 + HOUR, [m.partner]);
    await detect(T0 + 2 * HOUR);
    expect(await collisionsFor(a, b)).toHaveLength(0);
  });
});

describe('clash checker: re-detection after a decision', () => {
  test('a dismissed pair that is edited and still overlaps gets a fresh open collision', async () => {
    const { t, m, T0, add, detect, collisionsFor } = await seeded();
    const a = await add('Pickup', T0 + 2 * HOUR, T0 + 3 * HOUR, [m.partner]);
    const b = await add('Work dinner', T0 + 2.5 * HOUR, T0 + 4 * HOUR, [m.partner]);
    await detect(T0);
    const [first] = await collisionsFor(a, b);
    await t.run((ctx) => ctx.db.patch(first._id, { status: 'dismissed' }));
    await t.run((ctx) => ctx.db.patch(b, { start: T0 + 2.75 * HOUR })); // moved, still clashing
    await detect(T0);
    const rows = await collisionsFor(a, b);
    expect(rows.filter((c) => c.status === 'open')).toHaveLength(1);
  });

  test('a dismissed pair that has not changed is NOT re-flagged on the next sweep (no spam)', async () => {
    const { t, m, T0, add, detect, collisionsFor } = await seeded();
    const a = await add('Pickup', T0 + 2 * HOUR, T0 + 3 * HOUR, [m.partner]);
    const b = await add('Work dinner', T0 + 2.5 * HOUR, T0 + 4 * HOUR, [m.partner]);
    await detect(T0);
    const [first] = await collisionsFor(a, b);
    await t.run((ctx) => ctx.db.patch(first._id, { status: 'dismissed' }));
    await detect(T0 + 5 * 60_000);
    await detect(T0 + 10 * 60_000);
    const rows = await collisionsFor(a, b);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('dismissed');
  });

  test('a pair that went stale and then clashes again is flagged again', async () => {
    const { t, m, T0, add, detect, collisionsFor } = await seeded();
    const a = await add('Pickup', T0 + 2 * HOUR, T0 + 3 * HOUR, [m.partner]);
    const b = await add('Work dinner', T0 + 2.5 * HOUR, T0 + 4 * HOUR, [m.partner]);
    await detect(T0);
    await t.run((ctx) => ctx.db.patch(b, { start: T0 + 3 * HOUR })); // no longer overlapping
    await detect(T0);
    await t.run((ctx) => ctx.db.patch(b, { start: T0 + 2.5 * HOUR })); // back to clashing
    await detect(T0);
    const rows = await collisionsFor(a, b);
    expect(rows.filter((c) => c.status === 'open')).toHaveLength(1);
    expect(rows.filter((c) => c.status === 'stale')).toHaveLength(1);
  });

  test('running the sweep twice on an open clash never creates a duplicate', async () => {
    const { m, T0, add, detect, collisionsFor } = await seeded();
    const a = await add('Pickup', T0 + 2 * HOUR, T0 + 3 * HOUR, [m.partner]);
    const b = await add('Work dinner', T0 + 2.5 * HOUR, T0 + 4 * HOUR, [m.partner]);
    await detect(T0);
    await detect(T0);
    expect(await collisionsFor(a, b)).toHaveLength(1);
  });
});

describe('clash checker: all-day events', () => {
  test('events.create gives an all-day event without `end` the end of its local day', async () => {
    const { t, m } = await seeded();
    const id = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.events.create, {
      title: 'Field trip',
      start: Date.UTC(2027, 2, 10, 5, 0),
      allDay: '2027-03-10',
      who: [m.twin1],
      scope: 'family',
    });
    const ev = await t.run((ctx) => ctx.db.get(id));
    expect(ev?.end).toBeDefined();
    expect(ev!.end!).toBeGreaterThan(ev!.start);
  });

  test('an all-day event with no stored end still overlaps a timed event that day (older rows)', () => {
    const allDay = { start: Date.UTC(2027, 2, 10, 5, 0), end: undefined, allDay: '2027-03-10' } as Pick<Doc<'events'>, 'start' | 'end' | 'allDay'>;
    const timed = { start: Date.UTC(2027, 2, 10, 18, 0), end: Date.UTC(2027, 2, 10, 19, 0) } as Pick<Doc<'events'>, 'start' | 'end' | 'allDay'>;
    expect(overlapMs(allDay, timed)).toBeGreaterThan(0);
  });
});
