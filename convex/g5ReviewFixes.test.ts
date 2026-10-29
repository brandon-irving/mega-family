/// <reference types="vite/client" />
// G5 review fixes (CONTRACT v0.17b), each written to fail before its fix: schedule-link reasons (U1), the
// onboarding resume (C2), repeat answers to rule-answered blocks (C3), the sync lease (C4), the Calendar sync
// token (C5), adults-only skip (C8), combined reconnect (C9/C10), the full-family escape (C12), the profiler
// claim (C13), invite retrieval (U3), and the frontend's asks (activity decidedBy, kid's own rules, kid
// notification cap). Synthetic data only.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { ConvexError } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GOOGLE } from '../shared/config/google';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakeCalendarSource, makeFakeGoogleOAuth, makeFakeMailSource } from './adapters/fakeGoogle';
import { makeFakeIcsFetcher } from './adapters/fakeIcsFetcher';
import { __setCalendarSourceForTests, __setChatModelForTests, __setGoogleOAuthForTests, __setIcsFetcherForTests, __setMailSourceForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { IcsFetcher } from './ports/icsFetcher';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2';
const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);
const KEY = btoa('k'.repeat(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let modelCalls = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  process.env.INTEGRATION_TOKEN_KEY = KEY;
  process.env.CONVEX_SITE_URL = 'https://test-site.convex.site';
  process.env.SITE_URL = 'http://localhost:8081';
  modelCalls = 0;
  __setGoogleOAuthForTests(makeFakeGoogleOAuth());
  __setMailSourceForTests(makeFakeMailSource());
  __setCalendarSourceForTests(makeFakeCalendarSource());
  __setIcsFetcherForTests(makeFakeIcsFetcher());
  __setChatModelForTests(
    makeFakeChatModel(() => {
      modelCalls++;
      return jsonReply({ items: [] });
    }),
  );
});
afterEach(() => {
  for (const k of ['INTEGRATION_TOKEN_KEY', 'CONVEX_SITE_URL', 'SITE_URL']) delete process.env[k];
  __setGoogleOAuthForTests(null);
  __setMailSourceForTests(null);
  __setCalendarSourceForTests(null);
  __setIcsFetcherForTests(null);
  __setChatModelForTests(null);
  vi.useRealTimers();
});

async function seeded() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const connectGoogle = async (k: Key, want: ('gmail' | 'googleCalendar')[], opts: { error?: string } = {}) => {
    const { authUrl } = await as(k).mutation(api.integrations.googleStart, { want });
    const state = new URL(authUrl).searchParams.get('state')!;
    const q = new URLSearchParams({ state, ...(opts.error ? { error: opts.error } : { code: 'good-code' }) });
    return t.fetch(`${GOOGLE.callbackPath}?${q}`, { method: 'GET', redirect: 'manual' });
  };
  const integ = (k: Key, kind: string) => t.run(async (ctx) => (await ctx.db.query('integrations').withIndex('by_family_member_kind', (q) => q.eq('familyId', familyId).eq('memberId', m[k]).eq('kind', kind as 'gmail')).collect())[0] ?? null);
  const thread = (k: Key) =>
    t.run(async (ctx) => {
      const th = await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m[k])).unique();
      return th ? ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', th._id)).collect() : [];
    });
  return { t, familyId, m, as, settle, connectGoogle, integ, thread };
}

const failingIcs = (detail: string, failure: 'error' | 'no_result' = 'error'): IcsFetcher => ({ fetch: async () => ({ ok: false, failure, detail }) });

describe('U1: a schedule link that can’t be added says why', () => {
  test('unreachable (timed out / network) → reason "unreachable"; nothing saved', async () => {
    const s = await seeded();
    __setIcsFetcherForTests(failingIcs('unreachable'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://slow.example.org/a.ics' })).toEqual({ events: 0, failure: 'error', reason: 'unreachable' });
    expect(await s.integ('partner', 'ics')).toBeNull();
  });

  test('a page that isn’t a calendar → "not_a_calendar"; too big → "too_large"; a private host → "refused"', async () => {
    const s = await seeded();
    __setIcsFetcherForTests(makeFakeIcsFetcher('<html>hello</html>'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://site.example.org/a.ics' })).toMatchObject({ events: 0, reason: 'not_a_calendar' });
    __setIcsFetcherForTests(failingIcs('too_large'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://site.example.org/b.ics' })).toMatchObject({ events: 0, reason: 'too_large' });
    __setIcsFetcherForTests(failingIcs('refused'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://site.example.org/c.ics' })).toMatchObject({ events: 0, reason: 'refused' });
  });

  test('a link to a private address is a VALIDATION error before anything is fetched', async () => {
    const s = await seeded();
    const fetcher = makeFakeIcsFetcher();
    __setIcsFetcherForTests(fetcher);
    expect(codeOf(await s.as('partner').action(api.integrations.addIcs, { url: 'https://169.254.169.254/latest/meta-data/' }).catch((e) => e))).toBe('VALIDATION');
    expect(fetcher.urls).toHaveLength(0);
  });
});

const TZ = 'America/New_York';

/** A brand-new owner mid-onboarding (no sample family). */
async function freshOwner() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const me = t.withIdentity({ subject: 'new-owner' });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const { familyId, threadId } = await me.mutation(api.onboarding.begin, { timezone: TZ });
  const messages = () => t.run((ctx) => ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', threadId)).collect());
  const lastBlock = async () => [...(await messages())].reverse().find((m) => m.body.type === 'block')!;
  const answer = async (a: Record<string, unknown>) => me.mutation(api.chat.answerBlock, { messageId: (await lastBlock())._id, answer: a, via: 'text' });
  const row = () => t.run((ctx) => ctx.db.query('onboarding').withIndex('by_family_member', (q) => q.eq('familyId', familyId)).first());
  const toFamilyStep = async () => {
    await me.mutation(api.onboarding.setName, { name: 'Sam' });
    for (const offer of ['gmail', 'calendar', 'ics'] as const) await me.mutation(api.onboarding.skip, { offer });
  };
  return { t, me, settle, familyId, threadId, messages, lastBlock, answer, row, toFamilyStep };
}

const blockKind = (m: { body: { type: string } }) => (m.body as { block?: { kind: string } }).block?.kind;

describe('C2: resuming onboarding never restarts the family step', () => {
  test('20+ other messages later, chat.start keeps the current sub-step (look) and its block; no second "who"', async () => {
    const s = await freshOwner();
    await s.toFamilyStep();
    await s.answer({ optionIds: ['kid'] });
    await s.answer({ value: 'Robin' });
    await s.answer({ optionIds: ['daughter'] });
    await s.answer({ optionIds: ['yes'] });
    await s.answer({ skipped: true });
    const before = await s.row();
    expect(before!.family!.step).toBe('look');
    const whoCount = async () => (await s.messages()).filter((m) => m.body.type === 'block' && (m.body.block as { prompt?: string }).prompt === 'Who should I add first?').length;
    const whoBefore = await whoCount();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 25; i++) await ctx.db.insert('messages', { familyId: s.familyId, threadId: s.threadId, at: Date.now() + i, author: before!.blockMessageId ? { kind: 'member', id: before!.memberId } : { kind: 'member', id: before!.memberId }, via: 'text', body: { type: 'text', text: `chatter ${i}` }, chips: [] });
    });
    await s.me.mutation(api.chat.start, {});
    const after = await s.row();
    expect(after!.family!.step).toBe('look');
    expect(after!.personId).toEqual(before!.personId);
    expect(await whoCount()).toBe(whoBefore);
    const members = await s.t.run((ctx) => ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', s.familyId)).collect());
    expect(members.filter((m) => m.name === 'Robin')).toHaveLength(1);
  });

  test('if the waiting block is gone, chat.start re-posts the SAME sub-step’s block (look), not "who"', async () => {
    const s = await freshOwner();
    await s.toFamilyStep();
    await s.answer({ optionIds: ['kid'] });
    await s.answer({ value: 'Robin' });
    await s.answer({ optionIds: ['daughter'] });
    await s.answer({ optionIds: ['yes'] });
    await s.answer({ skipped: true });
    const before = (await s.row())!;
    await s.t.run((ctx) => ctx.db.delete(before.blockMessageId!));
    await s.me.mutation(api.chat.start, {});
    const after = (await s.row())!;
    expect(after.family!.step).toBe('look');
    expect(after.blockMessageId).not.toEqual(before.blockMessageId);
    const reposted = await s.t.run((ctx) => ctx.db.get(after.blockMessageId!));
    expect(blockKind(reposted!)).toBe('look');
    // And it can be answered, finishing the person as usual.
    await s.answer({ fields: { hex: '#8E6CE0', sticker: 'bolt', personality: 'cheerful', name: 'Zip' } });
    expect((await s.row())!.family!.step).toBe('more');
  });
});

describe('C3: a repeat answer to a rule-answered block is a no-op (never an agent reply)', () => {
  test('double-tapping a family block: the second call returns no streamId and schedules no model call', async () => {
    const s = await freshOwner();
    await s.toFamilyStep();
    const who = await s.lastBlock();
    await s.me.mutation(api.chat.answerBlock, { messageId: who._id, answer: { optionIds: ['kid'] }, via: 'text' });
    const count = (await s.messages()).length;
    const again = await s.me.mutation(api.chat.answerBlock, { messageId: who._id, answer: { optionIds: ['kid'] }, via: 'text' });
    expect(again.streamId).toBeUndefined();
    await s.settle();
    expect(modelCalls).toBe(0);
    expect((await s.messages()).length).toBe(count);
  });

  test('double-tapping a profiler check question: no second answer bubble, no agent reply', async () => {
    const s = await seeded();
    const now = await s.t.run(async (ctx) => {
      const c = await ctx.db.query('clocks').withIndex('by_family', (q) => q.eq('familyId', s.familyId)).unique();
      return Date.now() + (c?.offsetMs ?? 0);
    });
    const memoryId = await s.t.run((ctx) =>
      ctx.db.insert('memories', {
        familyId: s.familyId,
        scope: 'personal',
        scopeKey: `${s.familyId}:personal:${s.m.partner}`,
        about: [s.m.partner],
        kind: 'routine',
        text: 'Partner walks the dog at 7',
        source: { kind: 'message' },
        trigger: 'stated',
        confidence: 0.8,
        confirmed: false,
        sensitive: false,
        pinned: false,
        createdAt: now,
        lastUsedAt: now,
      }),
    );
    await s.t.run(async (ctx) => {
      const p = (await ctx.db.query('profiles').withIndex('by_family_member', (q) => q.eq('familyId', s.familyId).eq('memberId', s.m.partner)).unique())!;
      await ctx.db.patch(p._id, { checkQuestions: [{ memoryId, question: 'Still walking the dog at 7?', askAfter: 0 }] });
      const c = (await ctx.db.query('clocks').withIndex('by_family', (q) => q.eq('familyId', s.familyId)).unique())!;
      const day = new Date(now).toLocaleDateString('en-CA', { timeZone: TZ });
      const { zonedInstant } = await import('../shared/time');
      await ctx.db.patch(c._id, { offsetMs: c.offsetMs + (zonedInstant(day, 17 * 60, TZ) - now) });
    });
    await s.t.mutation(internal.profiler.sweep, {});
    const thread = await s.thread('partner');
    const block = thread.find((m) => m.body.type === 'block' && (m.body.block as { prompt?: string }).prompt === 'Still walking the dog at 7?')!;
    expect(block).toBeDefined();
    await s.as('partner').mutation(api.chat.answerBlock, { messageId: block._id, answer: { optionIds: ['yes'] }, via: 'text' });
    const count = (await s.thread('partner')).length;
    const again = await s.as('partner').mutation(api.chat.answerBlock, { messageId: block._id, answer: { optionIds: ['yes'] }, via: 'text' });
    expect(again.streamId).toBeUndefined();
    // (The sweep also scheduled the nightly profiler runs, which call the model; the answer itself must not.)
    const after = await s.thread('partner');
    expect(after.length).toBe(count);
    expect(after.some((m) => m.streamId !== undefined && m.at >= block.at)).toBe(false);
  });
});

describe('C8: onboarding.skip is adults only', () => {
  test('a kid gets FORBIDDEN and no onboarding row is written', async () => {
    const s = await seeded();
    expect(codeOf(await s.as('twin1').mutation(api.onboarding.skip, { offer: 'gmail' }).catch((e) => e))).toBe('FORBIDDEN');
    expect(await s.t.run((ctx) => ctx.db.query('onboarding').withIndex('by_family_member', (q) => q.eq('familyId', s.familyId).eq('memberId', s.m.twin1)).unique())).toBeNull();
  });
});

describe('C12: a full family has a way out of the family step', () => {
  test('at ONBOARDING.maxFamilyMembers, picking "A kid" says the family is full and offers "Done for now", which finishes', async () => {
    const s = await freshOwner();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 11; i++) await ctx.db.insert('members', { familyId: s.familyId, name: `Person ${i}`, role: 'adult', activities: [], hasMega: false });
    });
    await s.toFamilyStep();
    await s.answer({ optionIds: ['kid'] });
    const block = await s.lastBlock();
    const options = (block.body as { block: { options?: { id: string }[] } }).block.options ?? [];
    expect(options.map((o) => o.id)).toEqual(['done']);
    await s.answer({ optionIds: ['done'] });
    expect((await s.row())!.step).toBe('done');
    const members = await s.t.run((ctx) => ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', s.familyId)).collect());
    expect(members).toHaveLength(12);
  });
});

describe('C9/C10: a combined Gmail + Calendar grant lapses and reconnects as one', () => {
  test('a combined lapse posts ONE reconnect card that lists both integrations', async () => {
    const s = await seeded();
    await s.connectGoogle('partner', ['gmail', 'googleCalendar']);
    await s.settle();
    await s.t.run(async (ctx) => {
      for (const secret of await ctx.db.query('integrationSecrets').take(10)) await ctx.db.patch(secret._id, { accessTokenExpiresAt: 0 });
    });
    __setGoogleOAuthForTests(makeFakeGoogleOAuth({ refreshFails: true }));
    await s.t.action(internal.integrations.syncGmail, { integrationId: (await s.integ('partner', 'gmail'))!._id });
    const cards = (await s.thread('partner')).flatMap((x) => (x.body.type === 'card' && x.body.card.kind === 'reconnect' ? [x.body.card] : []));
    expect(cards).toHaveLength(1);
    const ids = [(await s.integ('partner', 'gmail'))!._id, (await s.integ('partner', 'googleCalendar'))!._id].sort();
    expect([...(cards[0] as { integrationIds?: string[] }).integrationIds!].sort()).toEqual(ids);
  });

  test('a denied combined reconnect records the failure on BOTH offers', async () => {
    const s = await seeded();
    await s.connectGoogle('partner', ['gmail', 'googleCalendar'], { error: 'access_denied' });
    expect(await s.as('partner').query(api.integrations.offer, { offer: 'gmail' })).toMatchObject({ state: 'failed' });
    expect(await s.as('partner').query(api.integrations.offer, { offer: 'calendar' })).toMatchObject({ state: 'failed' });
  });
});

describe('C13: one profiler run per member per day, even if two sweeps overlap', () => {
  test('the sweep claims a profilerRuns row before scheduling; a second sweep schedules nothing for that member', async () => {
    const s = await seeded();
    const now = await s.t.run(async (ctx) => {
      const c = await ctx.db.query('clocks').withIndex('by_family', (q) => q.eq('familyId', s.familyId)).unique();
      return Date.now() + (c?.offsetMs ?? 0);
    });
    // Two sweeps before either's runMember has run.
    await s.t.mutation(internal.profiler.sweep, {});
    await s.t.mutation(internal.profiler.sweep, {});
    const scheduled = await s.t.run((ctx) => ctx.db.system.query('_scheduled_functions').take(500));
    const runs = scheduled.filter((f) => f.name.includes('runMember') && f.state.kind === 'pending');
    const perMember = new Map<string, number>();
    for (const r of runs) {
      const key = String((r.args[0] as { memberId: string }).memberId);
      perMember.set(key, (perMember.get(key) ?? 0) + 1);
    }
    expect([...perMember.values()].every((n) => n === 1)).toBe(true);
    expect(now).toBeGreaterThan(0);
  });
});

describe('U3: an invite can be found again from the member’s row', () => {
  async function withUnjoinedKid() {
    const s = await seeded();
    const kidId = await s.t.run(async (ctx) => {
      const id = await ctx.db.insert('members', { familyId: s.familyId, name: 'New Kid', role: 'kid', activities: [], hasMega: false });
      await ctx.db.insert('relationships', { familyId: s.familyId, from: s.m.admin, to: id, kind: 'parent' });
      return id;
    });
    return { ...s, kidId };
  }

  test('none → pending (with expiry and who sent it) after invites.create; the link itself is never readable back', async () => {
    const s = await withUnjoinedKid();
    expect(await s.as('admin').query(api.invites.forMember, { memberId: s.kidId })).toEqual({ status: 'none' });
    const { expiresAt } = await s.as('admin').mutation(api.invites.create, { memberId: s.kidId });
    const view = await s.as('admin').query(api.invites.forMember, { memberId: s.kidId });
    expect(view).toEqual({ status: 'pending', expiresAt, invitedByName: 'Admin' });
    expect(JSON.stringify(view)).not.toContain('mega://join/');
  });

  test('expired after its TTL; joined for a member who already signed in', async () => {
    const s = await withUnjoinedKid();
    await s.as('admin').mutation(api.invites.create, { memberId: s.kidId });
    await s.t.run(async (ctx) => {
      for (const inv of await ctx.db.query('invites').take(50)) await ctx.db.patch(inv._id, { expiresAt: 0 });
    });
    expect(await s.as('admin').query(api.invites.forMember, { memberId: s.kidId })).toMatchObject({ status: 'expired' });
    expect(await s.as('admin').query(api.invites.forMember, { memberId: s.m.twin1 })).toEqual({ status: 'joined' });
  });

  test('only the admin or the member’s parent: a sibling is FORBIDDEN', async () => {
    const s = await withUnjoinedKid();
    expect(codeOf(await s.as('twin1').query(api.invites.forMember, { memberId: s.kidId }).catch((e) => e))).toBe('FORBIDDEN');
  });
});

describe('frontend asks: activity decidedBy, a kid’s own rules, a kid’s notification cap', () => {
  test('megas.activity items carry decidedBy: the event’s own when it has one, else the config default for its type', async () => {
    const s = await seeded();
    await s.t.run(async (ctx) => {
      await ctx.db.insert('familyEvents', { familyId: s.familyId, at: Date.UTC(2030, 0, 1), type: 'said', payload: { decidedBy: 'model:muse-spark-1.3' }, processed: { memory: true, profiler: true, triggers: true } });
      await ctx.db.insert('familyEvents', { familyId: s.familyId, at: Date.UTC(2030, 0, 2), type: 'reminder.due', payload: {}, processed: { memory: true, profiler: true, triggers: true } });
    });
    const page = await s.as('admin').query(api.megas.activity, { paginationOpts: { numItems: 2, cursor: null } });
    expect(page.page.map((i) => i.decidedBy)).toEqual(['rule:reminder', 'model:muse-spark-1.3']);
  });

  test('kidControls.mine: a kid reads their own rules (incl. "parents can read chats" and the buzz cap); an adult gets null', async () => {
    const s = await seeded();
    const mine = await s.as('twin1').query(api.kidControls.mine, {});
    expect(mine).toMatchObject({ parentsCanReadChat: expect.any(Boolean), webSearch: expect.any(Boolean), homeworkMode: expect.any(Boolean), dailyCap: expect.any(Number), quietHours: expect.any(Object) });
    expect(await s.as('admin').query(api.kidControls.mine, {})).toBeNull();
  });

  test('kidControls.setDailyCap: a parent sets a kid’s buzzes-a-day (bounded by config); the kid and a sibling can’t', async () => {
    const s = await seeded();
    await s.as('admin').mutation(api.kidControls.setDailyCap, { memberId: s.m.twin1, dailyCap: 2 });
    expect((await s.as('twin1').query(api.kidControls.mine, {}))!.dailyCap).toBe(2);
    expect(codeOf(await s.as('twin1').mutation(api.kidControls.setDailyCap, { memberId: s.m.twin1, dailyCap: 9 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await s.as('twin2').mutation(api.kidControls.setDailyCap, { memberId: s.m.twin1, dailyCap: 1 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await s.as('admin').mutation(api.kidControls.setDailyCap, { memberId: s.m.twin1, dailyCap: 0 }).catch((e) => e))).toBe('VALIDATION');
    expect(codeOf(await s.as('admin').mutation(api.kidControls.setDailyCap, { memberId: s.m.twin1, dailyCap: 999 }).catch((e) => e))).toBe('VALIDATION');
    expect(codeOf(await s.as('admin').mutation(api.kidControls.setDailyCap, { memberId: s.m.partner, dailyCap: 3 }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('v0.17b reconcile: kidControls.mine names the kid’s parents ("Set by Admin and Partner")', async () => {
    const s = await seeded();
    const mine = await s.as('twin1').query(api.kidControls.mine, {});
    expect([...mine!.parents].sort()).toEqual(['Admin', 'Partner']);
  });

  test('v0.17b reconcile: kidControls.dailyCap — a parent reads the kid’s current buzzes-a-day; the kid, a sibling and a non-kid are FORBIDDEN', async () => {
    const s = await seeded();
    await s.as('admin').mutation(api.kidControls.setDailyCap, { memberId: s.m.twin1, dailyCap: 3 });
    expect(await s.as('partner').query(api.kidControls.dailyCap, { memberId: s.m.twin1 })).toEqual({ dailyCap: 3 });
    expect(codeOf(await s.as('twin1').query(api.kidControls.dailyCap, { memberId: s.m.twin1 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await s.as('twin2').query(api.kidControls.dailyCap, { memberId: s.m.twin1 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await s.as('admin').query(api.kidControls.dailyCap, { memberId: s.m.partner }).catch((e) => e))).toBe('FORBIDDEN');
  });
});

describe('C4: one sync per integration at a time', () => {
  test('while a sync holds the lease, another sync of the same integration does nothing (no provider calls, no writes)', async () => {
    const s = await seeded();
    const mail = makeFakeMailSource();
    __setMailSourceForTests(mail);
    await s.connectGoogle('partner', ['gmail']);
    await s.settle();
    const gmail = (await s.integ('partner', 'gmail'))!;
    const before = mail.requests.length;
    const configBefore = JSON.stringify(gmail.config);
    await s.t.run((ctx) => ctx.db.patch(gmail._id, { syncingUntil: Date.now() + 60_000 }));
    await s.t.action(internal.integrations.syncGmail, { integrationId: gmail._id });
    expect(mail.requests.length).toBe(before);
    expect(JSON.stringify((await s.integ('partner', 'gmail'))!.config)).toBe(configBefore);
  });

  test('a finished sync releases its lease; an expired lease does not block', async () => {
    const s = await seeded();
    const mail = makeFakeMailSource();
    __setMailSourceForTests(mail);
    await s.connectGoogle('partner', ['gmail']);
    await s.settle();
    const gmail = (await s.integ('partner', 'gmail'))!;
    expect(gmail.syncingUntil).toBeUndefined();
    await s.t.run((ctx) => ctx.db.patch(gmail._id, { syncingUntil: Date.now() - 1 }));
    const before = mail.requests.length;
    await s.t.action(internal.integrations.syncGmail, { integrationId: gmail._id });
    expect(mail.requests.length).toBeGreaterThan(before);
    expect((await s.integ('partner', 'gmail'))!.syncingUntil).toBeUndefined();
  });

  test('a sync position write merges into the stored config instead of replacing it', async () => {
    const s = await seeded();
    const { integrationId } = await s.as('partner').action(api.integrations.addIcs, { url: 'https://cal.example.org/team.ics' });
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(integrationId!))!;
      await ctx.db.patch(integrationId!, { config: { ...row.config, keepMe: 'yes' } });
    });
    await s.t.action(internal.integrations.syncIcs, { integrationId: integrationId! });
    expect((await s.t.run((ctx) => ctx.db.get(integrationId!)))!.config).toMatchObject({ keepMe: 'yes', url: 'https://cal.example.org/team.ics' });
  });
});

describe('C5: Google Calendar never loses its sync token', () => {
  const ev = (i: number) => ({ externalId: `e${i}`, title: `Event ${i}`, start: Date.UTC(2026, 9, 27, 14) + i * 60_000, cancelled: false });
  const pages = (perPage: number, count: number) => Array.from({ length: count }, (_, p) => Array.from({ length: perPage }, (_, i) => ev(p * perPage + i)));

  test('the event cap is reached before the last page: it keeps paging to the page with nextSyncToken and stores it', async () => {
    const s = await seeded();
    const book = pages(300, 3);
    const requests: (string | undefined)[] = [];
    __setCalendarSourceForTests({
      async listEvents({ pageToken }) {
        requests.push(pageToken);
        const i = pageToken ? Number(pageToken) : 0;
        return { ok: true, expired: false, events: book[i], ...(i < 2 ? { nextPageToken: String(i + 1) } : { nextSyncToken: 'sync-final' }) };
      },
    });
    await s.connectGoogle('partner', ['googleCalendar']);
    await s.settle();
    const row = (await s.integ('partner', 'googleCalendar'))!;
    expect(requests).toEqual([undefined, '1', '2']);
    expect(row.config).toMatchObject({ syncToken: 'sync-final' });
    const all = await s.t.run((ctx) => ctx.db.query('events').collect());
    expect(all.filter((e) => e.integrationId === row._id).length).toBeLessThanOrEqual(500);
  });

  test('an incremental pass that comes back without a new token keeps the old one', async () => {
    const s = await seeded();
    let calls = 0;
    __setCalendarSourceForTests({
      async listEvents({ syncToken }) {
        calls++;
        if (!syncToken) return { ok: true, expired: false, events: [ev(1)], nextSyncToken: 'T0' };
        return { ok: true, expired: false, events: [ev(2)] };
      },
    });
    await s.connectGoogle('partner', ['googleCalendar']);
    await s.settle();
    const row = (await s.integ('partner', 'googleCalendar'))!;
    expect(row.config).toMatchObject({ syncToken: 'T0' });
    await s.t.action(internal.integrations.syncGoogleCalendar, { integrationId: row._id });
    expect(calls).toBe(2);
    expect((await s.integ('partner', 'googleCalendar'))!.config).toMatchObject({ syncToken: 'T0' });
  });
});
