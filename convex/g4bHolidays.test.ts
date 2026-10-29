/// <reference types="vite/client" />
// G4b holidays (docs/gates/G4b.md invariant 9 and backend task 7): the cache, `holidays.upcoming`, the
// evening-before question to the grown-ups (the demo: jump to Tue Nov 10 2026, 6 PM → Veterans Day), the
// first-answer-wins decision, and what a pause does to routines, chores and the bedtime prep.
import { ConvexError } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HOLIDAYS } from '../shared/config/shopping';
import { zonedInstant } from '../shared/time';
import { makeFakeChatModel, textReply } from './adapters/fakeChatModel';
import { makeFakeHolidays } from './adapters/fakeHolidays';
import { __setChatModelForTests, __setHolidaysForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
const TZ = 'America/New_York';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';
const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);
const at = (date: string, hh: number, mm = 0) => zonedInstant(date, hh * 60 + mm, TZ);

beforeEach(() => {
  vi.useFakeTimers();
  process.env.DEMO_MODE = 'true';
  // Bedtime prep and any drafted push use the model; a plain reply keeps them offline.
  __setChatModelForTests(makeFakeChatModel(() => textReply('{"items":[]}')));
});
afterEach(() => {
  delete process.env.DEMO_MODE;
  __setChatModelForTests(null);
  __setHolidaysForTests(null);
  vi.useRealTimers();
});

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const jump = async (to: number) => {
    await as('admin').mutation(api.clock.jump, { to });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  const skips = () => t.run((ctx) => ctx.db.query('routineSkips').withIndex('by_family_date', (q) => q.eq('familyId', familyId)).collect());
  const holidayAsks = async () => (await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect())).filter((c) => c.source?.kind === 'holiday');
  const runs = (k: Key, kind: 'morning' | 'bedtime', date: string) =>
    t.run((ctx) => ctx.db.query('routineRuns').withIndex('by_family_member_kind_date', (q) => q.eq('familyId', familyId).eq('memberId', m[k]).eq('kind', kind).eq('date', date)).collect());
  const claimsOn = (date: string) => t.run(async (ctx) => (await ctx.db.query('choreClaims').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect()).filter((c) => c.date === date));
  return { t, familyId, m, as, jump, skips, holidayAsks, runs, claimsOn };
}

describe('holidays.upcoming', () => {
  test('any member sees the next public holidays from the cache, with the family’s decision; past ones are left out', async () => {
    const s = await seeded();
    await s.jump(at('2026-11-01', 9));
    for (const k of ['admin', 'twin1'] as const) {
      const list = await s.as(k).query(api.holidays.upcoming, {});
      expect(list.map((h) => [h.date, h.name, h.skip])).toEqual([
        ['2026-11-11', 'Veterans Day', null],
        ['2026-11-26', 'Thanksgiving Day', null],
      ]);
    }
    expect((await s.as('admin').query(api.holidays.upcoming, { days: 5 })).length).toBe(0);
    expect(codeOf(await s.as('admin').query(api.holidays.upcoming, { days: 0 }).catch((e) => e))).toBe('VALIDATION');
  });

  test('observances and regional holidays never count; a missing year is fetched through the Holidays port', async () => {
    const s = await seeded();
    const fake = makeFakeHolidays(({ year }) => ({
      ok: true,
      holidays:
        year === 2026
          ? [
              { date: '2026-11-03', name: 'Some Observance', localName: 'Some Observance', global: true, types: ['Observance'] },
              { date: '2026-11-04', name: 'Regional Day', localName: 'Regional Day', global: false, regions: ['US-NY'], types: ['Public'] },
              { date: '2026-11-11', name: 'Veterans Day', localName: 'Veterans Day', global: true, types: ['Public', 'Bank'] },
            ]
          : [],
    }));
    __setHolidaysForTests(fake);
    await s.t.run(async (ctx) => {
      for (const row of await ctx.db.query('holidays').withIndex('by_family_country_year', (q) => q.eq('familyId', s.familyId)).collect()) await ctx.db.delete(row._id);
    });
    await s.jump(at('2026-11-01', 9)); // the tick notices the empty cache and schedules a refresh
    expect(fake.requests.map((r) => `${r.year}/${r.country}`).sort()).toEqual(['2026/US', '2027/US']);
    expect((await s.as('admin').query(api.holidays.upcoming, {})).map((h) => h.name)).toEqual(['Veterans Day']);
  });
});

describe('invariant 9: a holiday is a question, and only adults decide', () => {
  test('nothing is asked before HOLIDAYS.askAt the evening before', async () => {
    const s = await seeded();
    await s.jump(at('2026-11-10', 17, 30));
    expect(await s.skips()).toHaveLength(1); // only the seeded past Labor Day row
  });

  test('the demo: Tue Nov 10, 6 PM → one asked row for the busy kids and a Veterans Day question to each grown-up', async () => {
    const s = await seeded();
    await s.jump(at('2026-11-10', 18));
    const skip = (await s.skips()).find((x) => x.date === '2026-11-11')!;
    expect(skip).toMatchObject({ holidayName: 'Veterans Day', status: 'asked' });
    expect([...skip.memberIds].sort()).toEqual([s.m.twin1, s.m.twin2].sort());
    const asks = await s.holidayAsks();
    expect(asks.map((c) => c.recipientId).sort()).toEqual([s.m.admin, s.m.partner].sort());
    expect(asks.every((c) => c.kind === 'request' && c.draft.buttons === 'holiday.default')).toBe(true);
    expect(asks[0].draft.text).toBe('Wednesday is Veterans Day. Pause the morning routine and chores for Twin 1 and Twin 2?');
    await s.jump(at('2026-11-10', 18, 30)); // asked once
    expect((await s.holidayAsks()).length).toBe(2);
    expect((await s.skips()).filter((x) => x.date === '2026-11-11').length).toBe(1);
  });

  test('live check finding: the jump itself delivers the question (not the next sweep, minutes later)', async () => {
    const s = await seeded();
    await s.as('admin').mutation(api.clock.jump, { to: at('2026-11-10', 18) }); // no scheduled functions run
    const asks = await s.holidayAsks();
    expect(asks.length).toBe(2);
    expect(asks.every((c) => c.status === 'delivered')).toBe(true);
  });

  test('kids can neither read nor answer it (FORBIDDEN); first grown-up answer wins', async () => {
    const s = await seeded();
    await s.jump(at('2026-11-10', 18));
    const skipId = (await s.skips()).find((x) => x.date === '2026-11-11')!._id;
    expect(codeOf(await s.as('twin1').query(api.holidays.question, { skipId }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await s.as('twin1').mutation(api.holidays.answer, { skipId, action: 'pause' }).catch((e) => e))).toBe('FORBIDDEN');
    const first = await s.as('admin').mutation(api.holidays.answer, { skipId, action: 'pause' });
    expect(first).toEqual({ status: 'paused', message: 'Paused for Wednesday by Admin. Bedtime prep will say there’s no school routine.' });
    const second = await s.as('partner').mutation(api.holidays.answer, { skipId, action: 'keep' });
    expect(second.status).toBe('paused');
    expect((await s.as('partner').query(api.holidays.question, { skipId })).answeredBy).toBe(s.m.admin);
    // Running every scheduled timer moved the simulated clock on; pin it back to the evening before.
    await s.as('admin').mutation(api.clock.jump, { to: at('2026-11-10', 18, 5) });
    expect((await s.as('twin2').query(api.holidays.upcoming, {}))[0].skip).toEqual({ skipId, status: 'paused' });
  });

  test('paused: the bedtime list opens with the note; no morning routine or chores on the holiday', async () => {
    const s = await seeded();
    await s.jump(at('2026-11-10', 18));
    const skipId = (await s.skips()).find((x) => x.date === '2026-11-11')!._id;
    await s.as('partner').mutation(api.holidays.answer, { skipId, action: 'pause' });
    await s.jump(at('2026-11-10', 20));
    const [bedtime] = await s.runs('twin1', 'bedtime', '2026-11-10');
    expect(bedtime.steps[0]).toMatchObject({ id: HOLIDAYS.bedtimeNoteStepId, label: 'No school routine tomorrow. Enjoy Veterans Day!' });
    await s.jump(at('2026-11-11', 20));
    for (const k of ['twin1', 'twin2'] as const) expect(await s.runs(k, 'morning', '2026-11-11')).toEqual([]);
    expect(await s.claimsOn('2026-11-11')).toEqual([]);
    // The next school day is back to normal.
    await s.jump(at('2026-11-12', 20));
    expect((await s.runs('twin1', 'morning', '2026-11-12')).length).toBe(1);
  });

  test('a pause after the bedtime run was made still adds the note (once)', async () => {
    const s = await seeded();
    await s.jump(at('2026-11-10', 18));
    await s.jump(at('2026-11-10', 20)); // bedtime run exists, no answer yet: no note
    expect((await s.runs('twin1', 'bedtime', '2026-11-10'))[0].steps.some((x) => x.id === HOLIDAYS.bedtimeNoteStepId)).toBe(false);
    const skipId = (await s.skips()).find((x) => x.date === '2026-11-11')!._id;
    await s.as('admin').mutation(api.holidays.answer, { skipId, action: 'pause' });
    const steps = (await s.runs('twin1', 'bedtime', '2026-11-10'))[0].steps;
    expect(steps.filter((x) => x.id === HOLIDAYS.bedtimeNoteStepId).length).toBe(1);
    expect(steps[0].id).toBe(HOLIDAYS.bedtimeNoteStepId);
  });

  test('kept, or never answered: the holiday runs like any school day', async () => {
    for (const answer of ['keep', null] as const) {
      const s = await seeded();
      await s.jump(at('2026-11-10', 18));
      const skipId = (await s.skips()).find((x) => x.date === '2026-11-11')!._id;
      if (answer) await s.as('admin').mutation(api.holidays.answer, { skipId, action: answer });
      await s.jump(at('2026-11-11', 20));
      expect((await s.runs('twin1', 'morning', '2026-11-11')).length, String(answer)).toBe(1);
      expect((await s.claimsOn('2026-11-11')).length, String(answer)).toBeGreaterThan(0);
    }
  });

  test('the push’s Pause for the day takes the same path as the card', async () => {
    const s = await seeded();
    await s.jump(at('2026-11-10', 18));
    const n = await s.t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', s.familyId).eq('recipientId', s.m.partner)).collect());
    const push = n.find((x) => x.buttons.some((b) => b.id === 'pause'))!;
    expect(push).toBeDefined();
    const r = await s.as('partner').mutation(api.notifications.answer, { notificationId: push._id, buttonId: 'pause', via: 'push' });
    expect(r.reply).toContain('Paused for Wednesday by Partner');
    expect((await s.skips()).find((x) => x.date === '2026-11-11')!.status).toBe('paused');
  });

  test('a weekend holiday is never asked about', async () => {
    const s = await seeded();
    __setHolidaysForTests(makeFakeHolidays(() => ({ ok: true, holidays: [{ date: '2026-11-14', name: 'Saturday Day', localName: 'Saturday Day', global: true, types: ['Public'] }] })));
    await s.t.action(internal.holidays.refreshFamily, { familyId: s.familyId });
    await s.jump(at('2026-11-13', 18));
    expect((await s.skips()).some((x) => x.date === '2026-11-14')).toBe(false);
  });
});
