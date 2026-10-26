/// <reference types="vite/client" />
// G1 nit fix: `today.get`'s events (convex/model/home.ts `todaysEvents`) excluded an event that started
// before local midnight and was still running — `localDate(e.start, tz) === today` is false for
// yesterday's date even though the event hasn't ended yet. Fixed to use the day's actual
// [start-of-day, end-of-day] window, reusing `eventsInRange` (which already keeps anything overlapping
// a window, including something that started earlier and is still running).
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { SAMPLE_FAMILY } from '../shared/fixtures/sampleFamily';
import { addDays, zonedInstant } from '../shared/time';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('today.get: an overnight event still running at midnight', () => {
  test('is included, not dropped for having started "yesterday"', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    const tz = SAMPLE_FAMILY.timezone;

    const today = '2026-10-26';
    const yesterday = addDays(today, -1);
    const nowInstant = zonedInstant(today, 60, tz); // 1:00 AM today

    // seed.sampleFamily already inserts this family's one `clocks` row; move it to a known "now".
    const clockRow = await t.run((ctx) => ctx.db.query('clocks').withIndex('by_family', (q) => q.eq('familyId', familyId)).unique());
    await t.run((ctx) => ctx.db.patch(clockRow!._id, { offsetMs: nowInstant - Date.now() }));

    const start = zonedInstant(yesterday, 23 * 60, tz); // 11:00 PM yesterday
    const end = zonedInstant(today, 2 * 60, tz); // 2:00 AM today
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', { familyId, title: 'Overnight flight', start, end, who: [members.admin], source: 'mega', scope: 'family', cancelled: false }),
    );

    const result = await t.withIdentity({ subject: 'sample:admin' }).query(api.today.get, {});
    expect(result.events.map((e) => e._id)).toContain(eventId);
  });
});
