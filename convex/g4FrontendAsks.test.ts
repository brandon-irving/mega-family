/// <reference types="vite/client" />
// G4 frontend requests (CONTRACT v0.15a): the travel card names its event and start; `travel.answer` (On my way /
// Snooze 5 / Remind me 30 min before) with the leave-by push buttons on the same path; the weather card's current
// temperature (`nowF`, Open-Meteo `current`); and `parentsTold` on a blocked kid search card.
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel, textReply, toolCallReply } from './adapters/fakeChatModel';
import { makeFakeDirections } from './adapters/fakeDirections';
import { makeFakeWeather } from './adapters/fakeWeather';
import { makeFakeWebSearch } from './adapters/fakeWebSearch';
import { openMeteoUrl, parseOpenMeteo } from './adapters/openMeteoNwsWeather';
import { __setChatModelForTests, __setDirectionsForTests, __setWeatherForTests, __setWebSearchForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';
const MIN = 60_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  __setChatModelForTests(null);
  __setDirectionsForTests(null);
  __setWeatherForTests(null);
  __setWebSearchForTests(null);
  vi.useRealTimers();
});

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const now = (await as('admin').query(api.clock.get, {})).now;
  const cards = (k: Key, kind: string) =>
    t.run(async (ctx) => {
      const thread = (await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m[k])).unique())!;
      const msgs = await ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id)).collect();
      return msgs.flatMap((x) => (x.body.type === 'card' && x.body.card.kind === kind ? [x.body.card as Record<string, unknown>] : []));
    });
  const reminders = (k: Key) => t.run(async (ctx) => (await ctx.db.query('reminders').withIndex('by_family_member_due', (q) => q.eq('familyId', familyId).eq('forMemberId', m[k])).collect()).filter((r) => !r.done));
  const turn = async (k: Key, script: ReturnType<typeof makeFakeChatModel>) => {
    __setChatModelForTests(script);
    const member = (await t.run((ctx) => ctx.db.get(m[k])))!;
    const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m[k])).unique()))!;
    const mega = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m[k])).unique()))!;
    await t.action(internal.agent.loop.runTurn, { familyId, memberId: m[k], role: member.role, megaId: mega._id, threadId: thread._id, userText: 'hi' });
  };
  const oneTool = (name: string, args: unknown) => {
    let step = 0;
    return makeFakeChatModel((req) => (req.schema ? jsonReply({}) : ++step === 1 ? toolCallReply([{ id: 'c1', name, arguments: args }]) : textReply('ok')));
  };
  return { t, familyId, m, as, now, cards, reminders, turn, oneTool };
}

async function pickupCheck(t: Awaited<ReturnType<typeof seeded>>) {
  __setDirectionsForTests(makeFakeDirections(() => ({ ok: true, minutes: 18, distanceMeters: 6400 })));
  await t.t.action(internal.travel.checkFamily, { familyId: t.familyId });
  const check = await t.t.run(async (ctx) => (await ctx.db.query('travelChecks').withIndex('by_family_event_checked', (q) => q.eq('familyId', t.familyId)).collect()).find((c) => c.minutes === 18)!);
  const event = (await t.t.run((ctx) => ctx.db.get(check.eventId)))!;
  return { check, event };
}

describe('travel card: event title and start', () => {
  test('a travel_time call for an event puts its title and start on the card', async () => {
    const s = await seeded();
    __setDirectionsForTests(makeFakeDirections(() => ({ ok: true, minutes: 18, distanceMeters: 6400 })));
    await s.turn('admin', s.oneTool('travel_time', { to: 'Soccer pickup' }));
    const card = (await s.cards('admin', 'travel')).at(-1)!;
    expect(card.eventTitle).toBe('Soccer pickup');
    expect(typeof card.eventStart).toBe('number');
  });
});

describe('travel.answer', () => {
  test('remind_30_before schedules a plain reminder 30 minutes before the event, for the caller', async () => {
    const s = await seeded();
    const { check, event } = await pickupCheck(s);
    const res = await s.as('partner').mutation(api.travel.answer, { travelCheckId: check._id, action: 'remind_30_before' });
    const r = (await s.reminders('partner')).find((x) => x.eventId === event._id)!;
    expect(Math.abs(r.dueAt - Math.max(s.now, event.start - 30 * MIN))).toBeLessThan(1000);
    expect(res.remindAt).toBe(r.dueAt);
  });

  test('snooze_5 re-reminds in 5 minutes and stops the pending leave-by push; on_my_way just stops it', async () => {
    const s = await seeded();
    const { check, event } = await pickupCheck(s);
    const pending = async () => (await s.t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', s.familyId)).collect())).filter((c) => c.source?.kind === 'leaveBy' && c.recipientId === s.m.admin && (c.status === 'scheduled' || c.status === 'new'));
    // (the reminder may already have been delivered, since leave-by can be due right away in the seed's demo time)
    await s.as('admin').mutation(api.travel.answer, { travelCheckId: check._id, action: 'snooze_5' });
    expect(Math.abs((await s.reminders('admin')).find((x) => x.eventId === event._id)!.dueAt - (s.now + 5 * MIN))).toBeLessThan(1000);
    expect(await pending()).toEqual([]);
    expect((await s.as('admin').mutation(api.travel.answer, { travelCheckId: check._id, action: 'on_my_way' })).remindAt).toBeNull();
  });

  test('only members who can see the event may answer', async () => {
    const s = await seeded();
    __setDirectionsForTests(makeFakeDirections());
    const field = (await s.as('partner').query(api.places.list, {})).find((p) => p.label === 'Soccer field')!;
    const privateId = await s.as('partner').mutation(api.events.create, { title: 'Run', start: s.now + 2 * 60 * MIN, who: [s.m.partner], scope: 'personal', placeId: field._id });
    await s.t.action(internal.travel.checkFamily, { familyId: s.familyId });
    const check = await s.t.run(async (ctx) => (await ctx.db.query('travelChecks').withIndex('by_family_event_checked', (q) => q.eq('familyId', s.familyId).eq('eventId', privateId)).collect())[0]);
    let code: string | undefined;
    try {
      await s.as('admin').mutation(api.travel.answer, { travelCheckId: check._id, action: 'remind_30_before' });
    } catch (e) {
      code = codeOf(e);
    }
    expect(code).toBe('NOT_FOUND');
  });

  test("the leave-by push's Snooze 5 min button takes the same path", async () => {
    const s = await seeded();
    const { event } = await pickupCheck(s);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const note = await s.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', s.familyId).eq('recipientId', s.m.admin)).collect();
      for (const n of rows) {
        const c = n.candidateId ? await ctx.db.get(n.candidateId) : null;
        if (c?.source?.kind === 'leaveBy') return n;
      }
      return null;
    });
    expect(note).not.toBeNull();
    await s.as('admin').mutation(api.notifications.answer, { notificationId: note!._id, buttonId: 'snooze_5', via: 'push' });
    expect((await s.reminders('admin')).some((x) => x.eventId === event._id)).toBe(true);
  });
});

describe('weather card nowF', () => {
  test('Open-Meteo is asked for the current block, and the card carries its temperature', async () => {
    expect(openMeteoUrl({ lat: 1, lng: 2, timezone: 'UTC', days: 2 })).toContain('current=temperature_2m');
    const parsed = parseOpenMeteo({ current: { time: 0, temperature_2m: 57.4, weather_code: 3 }, hourly: { time: [] }, daily: { time: [] } }, 'UTC');
    expect(parsed).toMatchObject({ ok: true, current: { tempF: 57.4, code: 3 } });

    const s = await seeded();
    const hour = Math.floor(s.now / 3_600_000) * 3_600_000;
    __setWeatherForTests(makeFakeWeather({ forecast: () => ({ ok: true, current: { tempF: 57.4, code: 3 }, hours: [{ at: hour, tempF: 50, precipPct: 0, code: 2 }], days: [] }), alerts: () => ({ ok: true, alerts: [] }) }));
    await s.turn('admin', s.oneTool('weather', {}));
    expect((await s.cards('admin', 'weather')).at(-1)!.nowF).toBe(57);
  });
});

describe('blocked kid search card: parentsTold', () => {
  const blockedJudge = () => {
    let step = 0;
    return makeFakeChatModel((req) =>
      req.schema ? jsonReply({ verdict: 'blocked', rephrased: '', category: 'violence', homeworkAnswer: false }) : ++step === 1 ? toolCallReply([{ id: 'c1', name: 'web_search', arguments: { query: 'scary videos of accidents' } }]) : textReply('ok'),
    );
  };

  test('true when the kid control tells parents, false when it is off', async () => {
    const s = await seeded();
    __setWebSearchForTests(makeFakeWebSearch());
    await s.turn('twin2', blockedJudge());
    expect((await s.cards('twin2', 'search')).at(-1)!.parentsTold).toBe(true);

    await s.t.run(async (ctx) => {
      const kc = (await ctx.db.query('kidControls').withIndex('by_family_member', (q) => q.eq('familyId', s.familyId).eq('memberId', s.m.twin1)).unique())!;
      await ctx.db.patch(kc._id, { tellsParents: { ...kc.tellsParents, blockedSearches: false } });
    });
    await s.turn('twin1', blockedJudge());
    expect((await s.cards('twin1', 'search')).at(-1)!.parentsTold).toBe(false);
  });
});
