/// <reference types="vite/client" />
// G8 `widgets.next` (docs/gates/G8.md invariants 1 and 4, backend task 2): the widget shows only what the viewer
// sees in the app, and the planned timeline stays honest (sorted, bounded, "soon" items really are soon, ends
// stale). Thursday of the seeded week: Soccer practice 4–5 PM (twins), Admin's private Dentist 4–5 PM, Partner's
// household Work dinner 5–7 PM and Soccer pickup 5:30 PM, Partner's private Haircut at noon.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { G8_COPY } from '../shared/config/copy';
import { WIDGET_TIMELINE } from '../shared/config/widgets';
import { LINKS } from '../shared/domain/api';
import type { WidgetTimeline } from '../shared/domain/api';
import { zonedInstant } from '../shared/time';
import { internal, api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { clock } from './ports/clock';
import { planEntries, shortText } from './model/widgetTimeline';
import type { PlanEvent } from './model/widgetTimeline';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
const TZ = 'America/New_York';
const MIN = 60_000;
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';
const at = (date: string, hh: number, mm = 0) => zonedInstant(date, hh * 60 + mm, TZ);
const THU = '2026-10-29';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const jump = (to: number) => t.run((ctx) => clock.jumpTo(ctx, familyId, to));
  const next = (k: Key) => as(k).query(api.widgets.next, {}) as Promise<WidgetTimeline>;
  return { t, familyId, m, as, jump, next };
}

const titles = (tl: WidgetTimeline) => tl.entries.flatMap((e) => (e.soon ?? []).map((s) => s.title));

/** Invariant 4, checked on every timeline the tests build. */
function expectHonest(tl: WidgetTimeline) {
  const { entries } = tl;
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.length).toBeLessThanOrEqual(WIDGET_TIMELINE.maxEntries);
  for (let i = 1; i < entries.length; i++) expect(entries[i].at).toBeGreaterThan(entries[i - 1].at);
  expect(entries[0].at).toBeLessThanOrEqual(tl.generatedAt);
  expect(entries[entries.length - 1].at).toBeLessThanOrEqual(tl.generatedAt + WIDGET_TIMELINE.horizonHours * 60 * MIN);
  for (const e of entries) {
    if (e.kind === 'soon') {
      expect(e.soon!.length).toBeGreaterThan(0);
      expect(e.soon!.length).toBeLessThanOrEqual(WIDGET_TIMELINE.maxSoon);
      for (const s of e.soon!) {
        expect(s.startsAt).toBeLessThanOrEqual(e.at + WIDGET_TIMELINE.soonWindowMinutes * MIN);
        expect(s.startsAt).toBeGreaterThan(e.at - WIDGET_TIMELINE.startedGraceMinutes * MIN);
      }
      expect(e.link).toBe(LINKS.today());
    } else expect(e.soon).toBeUndefined();
    if (e.kind === 'statement') {
      expect(e.statement!.short.length).toBeLessThanOrEqual(WIDGET_TIMELINE.shortStatementChars + 1); // + the "…"
      expect(e.link).toBe(LINKS.chat());
    }
  }
  const last = entries[entries.length - 1];
  if (!(entries.length === 1 && last.kind === 'empty')) expect(last.kind).toBe('stale');
  for (let i = 1; i < entries.length; i++) expect(JSON.stringify({ ...entries[i], at: 0 })).not.toBe(JSON.stringify({ ...entries[i - 1], at: 0 }));
}

describe('widgets.next: a widget shows only what the viewer sees (invariant 1)', () => {
  test("Admin's Thursday afternoon: practice and the private dentist (marked private), soon, then later entries, ending stale", async () => {
    const s = await seeded();
    await s.jump(at(THU, 15, 0));
    const tl = await s.next('admin');
    expectHonest(tl);
    const first = tl.entries[0];
    expect(first.kind).toBe('soon');
    const dentist = first.soon!.find((x) => x.title === 'Dentist');
    expect(dentist, 'the owner sees their own private event').toBeDefined();
    expect(dentist!.private).toBe(true);
    expect(dentist!.timeLabel).toBe('4:00 PM');
    expect(dentist!.startsAt).toBe(at(THU, 16));
    const practice = first.soon!.find((x) => x.title === 'Soccer practice');
    expect(practice!.private).toBe(false);
    expect(practice!.who.map((w) => w.name).sort()).toEqual(['Twin 1', 'Twin 2']);
    expect(first.soon!.map((x) => x.startsAt)).toEqual([...first.soon!.map((x) => x.startsAt)].sort((a, b) => a - b));
    expect(tl.kid).toBe(false);
    expect(tl.talkLink).toBe(LINKS.talk());
  });

  test("Partner never sees Admin's private dentist, even though Partner is in Thursday's household events", async () => {
    const s = await seeded();
    await s.jump(at(THU, 15, 0));
    const tl = await s.next('partner');
    expectHonest(tl);
    expect(titles(tl)).not.toContain('Dentist');
    expect(JSON.stringify(tl)).not.toContain('Dentist');
    expect(titles(tl)).toContain('Work dinner');
    expect(titles(tl)).toContain('Soccer pickup');
  });

  test("Partner's own private haircut is on Partner's widget (private), never on Admin's", async () => {
    const s = await seeded();
    await s.jump(at(THU, 11, 0));
    const partner = await s.next('partner');
    expectHonest(partner);
    const haircut = partner.entries[0].soon!.find((x) => x.title === 'Haircut');
    expect(haircut?.private).toBe(true);
    expect(JSON.stringify(await s.next('admin'))).not.toContain('Haircut');
  });

  test("Twin 1 sees only events Twin 1 is in (or the whole family's); never an adult's dinner, pickup or private items", async () => {
    const s = await seeded();
    await s.jump(at(THU, 15, 0));
    const tl = await s.next('twin1');
    expectHonest(tl);
    expect(tl.kid).toBe(true);
    const seen = titles(tl);
    expect(seen).toContain('Soccer practice');
    for (const t of ['Dentist', 'Haircut', 'Work dinner', 'Soccer pickup']) expect(seen).not.toContain(t);
    const raw = JSON.stringify(tl);
    for (const t of ['Dentist', 'Haircut', 'Work dinner', 'gift', 'Gift', 'price', 'Price']) expect(raw).not.toContain(t);
    for (const e of tl.entries) for (const x of e.soon ?? []) expect(x.private).toBe(false);
  });

  test("a whole-family event (no one listed) reaches a kid's widget; a household event for adults only doesn't", async () => {
    const s = await seeded();
    await s.t.run(async (ctx) => {
      const base = { familyId: s.familyId, cancelled: false, source: 'mega' as const, createdBy: s.m.admin };
      await ctx.db.insert('events', { ...base, title: 'Movie night', start: at(THU, 15, 30), end: at(THU, 17), scope: 'family', who: [] });
      await ctx.db.insert('events', { ...base, title: 'Grown-ups budget chat', start: at(THU, 15, 45), scope: 'adults', who: [] });
    });
    await s.jump(at(THU, 15, 0));
    const kid = titles(await s.next('twin1'));
    expect(kid).toContain('Movie night');
    expect(kid).not.toContain('Grown-ups budget chat');
    expect(titles(await s.next('partner'))).toContain('Grown-ups budget chat');
  });

  test("statements come only from the viewer's own MEGA's delivered statements, never another member's", async () => {
    const s = await seeded();
    await s.jump(at(THU, 21, 0)); // nothing left on Thursday evening for Twin 1
    await s.t.run(async (ctx) => {
      const row = (recipientId: Id<'members'>, text: string, score: number) =>
        ctx.db.insert('candidates', {
          familyId: s.familyId,
          recipientId,
          kind: 'tip',
          dedupeKey: `test:${text}`,
          status: 'delivered',
          delivery: 'statement',
          score,
          window: { from: 0, to: at(THU, 23, 59) },
          draft: { text, buttons: 'tip.default' },
        });
      await row(s.m.twin1, 'Pick a book for tomorrow? It is reading night again.', 5);
      await row(s.m.admin, 'Admin-only: the gift order ships Friday.', 9);
    });
    const tl = await s.next('twin1');
    expectHonest(tl);
    const st = tl.entries.find((e) => e.kind === 'statement');
    expect(st?.statement?.text).toBe('Pick a book for tomorrow? It is reading night again.');
    expect(st!.statement!.short.endsWith('…')).toBe(true);
    expect(JSON.stringify(tl)).not.toContain('gift order');
    expect(tl.mega.name).toBe('Zap');
  });
});

describe('widgets.next: the timeline stays honest (invariant 4)', () => {
  test('entries change exactly when an event enters the 2-hour window or leaves after its grace, then end stale', async () => {
    const s = await seeded();
    const now = at(THU, 15, 0);
    await s.jump(now);
    const tl = await s.next('partner');
    expectHonest(tl);
    expect(Math.abs(tl.generatedAt - now)).toBeLessThan(1000); // the clock offset is stored against real time
    expect(tl.entries[0].at).toBe(tl.generatedAt);
    // Soccer practice (4:00) leaves at 4:10; Work dinner (5:00) and Soccer pickup (5:30) were already in the window.
    const ats = tl.entries.map((e) => e.at);
    expect(ats).toContain(at(THU, 16, WIDGET_TIMELINE.startedGraceMinutes));
    const after = tl.entries.find((e) => e.at === at(THU, 16, WIDGET_TIMELINE.startedGraceMinutes))!;
    expect(after.soon!.map((x) => x.title)).toEqual(['Work dinner', 'Soccer pickup']);
    const last = tl.entries[tl.entries.length - 1];
    expect(last.kind).toBe('stale');
    expect(last.link).toBe(LINKS.today());
  });

  test('nothing planned and nothing to say: one honest empty entry', async () => {
    const s = await seeded();
    await s.jump(at('2026-10-31', 2, 0));
    await s.t.run(async (ctx) => {
      for (const c of await ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', s.familyId)).collect()) await ctx.db.delete(c._id);
      for (const e of await ctx.db.query('events').withIndex('by_family_start', (q) => q.eq('familyId', s.familyId)).collect()) await ctx.db.delete(e._id);
    });
    const tl = await s.next('twin2');
    expectHonest(tl);
    expect(tl.entries).toEqual([{ at: tl.generatedAt, kind: 'empty', link: LINKS.today() }]);
  });

  test('never more than maxEntries, with the last one stale, on a crowded day', async () => {
    const s = await seeded();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) {
        await ctx.db.insert('events', { familyId: s.familyId, cancelled: false, source: 'mega', createdBy: s.m.admin, title: `Slot ${i}`, start: at(THU, 9, i * 15), scope: 'family', who: [] });
      }
    });
    await s.jump(at(THU, 8, 0));
    const tl = await s.next('admin');
    expectHonest(tl);
    expect(tl.entries).toHaveLength(WIDGET_TIMELINE.maxEntries);
    expect(tl.entries[tl.entries.length - 1].kind).toBe('stale');
  });

  test('the stale copy names the MEGA (G8_COPY has it); the server sends no text for stale, only the kind and link', async () => {
    expect(G8_COPY.widgetStale).toContain('{mega}');
    const s = await seeded();
    await s.jump(at(THU, 15, 0));
    const last = (await s.next('admin')).entries.at(-1)!;
    expect(last).toEqual({ at: last.at, kind: 'stale', link: LINKS.today() });
  });
});

describe('planEntries (the pure rule)', () => {
  const now = at(THU, 12);
  const ev = (title: string, hh: number, mm = 0): PlanEvent => ({ id: title, title, startsAt: at(THU, hh, mm), timeLabel: '', who: [], private: false });

  test('a statement-only plan ends stale at the horizon; an empty-only plan stays one entry', () => {
    const s = planEntries({ now, events: [], statement: 'Recycling goes out Tuesday. Want a reminder?' });
    expect(s.map((e) => e.kind)).toEqual(['statement', 'stale']);
    expect(s[1].at).toBe(now + WIDGET_TIMELINE.horizonHours * 60 * MIN);
    expect(planEntries({ now, events: [], statement: null })).toEqual([{ at: now, kind: 'empty', link: LINKS.today() }]);
  });

  test('an event enters exactly soonWindow before it starts and leaves exactly startedGrace after', () => {
    const plan = planEntries({ now, events: [ev('Piano', 15)], statement: null });
    expect(plan.map((e) => [e.kind, e.at])).toEqual([
      ['empty', now],
      ['soon', at(THU, 15) - WIDGET_TIMELINE.soonWindowMinutes * MIN],
      ['empty', at(THU, 15) + WIDGET_TIMELINE.startedGraceMinutes * MIN],
      ['stale', now + WIDGET_TIMELINE.horizonHours * 60 * MIN],
    ]);
  });

  test('events past the horizon never create entries, and a truncated plan goes stale at the first change it dropped', () => {
    expect(planEntries({ now, events: [ev('Late', 23)], statement: null }).map((e) => e.kind)).toEqual(['empty', 'stale']);
    const many = Array.from({ length: 20 }, (_, i) => ev(`E${i}`, 13, i * 10));
    const plan = planEntries({ now, events: many, statement: null });
    expect(plan).toHaveLength(WIDGET_TIMELINE.maxEntries);
    expect(plan.at(-1)!.kind).toBe('stale');
    expect(plan.at(-1)!.at).toBeLessThan(now + WIDGET_TIMELINE.horizonHours * 60 * MIN);
  });

  test('shortText keeps whole words and marks the cut', () => {
    expect(shortText('Short one', 32)).toBe('Short one');
    const s = shortText('Recycling goes out Tuesday. Want a reminder Monday night?', 32);
    expect(s).toBe('Recycling goes out Tuesday…'); // whole words only, trailing punctuation dropped
    expect(shortText('A'.repeat(50), 32)).toBe(`${'A'.repeat(32)}…`); // one long word: a hard cut
    expect(s.length).toBeLessThanOrEqual(33);
  });
});
