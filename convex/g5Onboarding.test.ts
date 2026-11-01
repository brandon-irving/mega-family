import { postStep } from './model/onboarding';
import { MEGA_CREATION } from '../shared/config/megaCreation';
/// <reference types="vite/client" />
// G5 onboarding chat (docs/gates/G5.md invariants 10–12): sign up → "What should I call you?" → Gmail → a
// calendar → schedule links → the family step, server-driven and model-free; `family.add`; the nightly profiler.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { ConvexError } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fillCopy, G5_COPY } from '../shared/config/copy';
import { PROFILER } from '../shared/config/onboarding';
import { localDate, zonedInstant } from '../shared/time';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests, __setIcsFetcherForTests } from './adapters/registry';
import { makeFakeIcsFetcher } from './adapters/fakeIcsFetcher';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { ChatModelRequest } from './ports/chatModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const TZ = 'America/New_York';
const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);

let agentCalls = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  agentCalls = 0;
  __setChatModelForTests(
    makeFakeChatModel(() => {
      agentCalls++;
      return jsonReply({ updates: [] });
    }),
  );
  __setIcsFetcherForTests(makeFakeIcsFetcher());
});
afterEach(() => {
  __setChatModelForTests(null);
  __setIcsFetcherForTests(null);
  vi.useRealTimers();
});

async function fresh() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const me = t.withIdentity({ subject: 'new-owner' });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const { familyId, threadId } = await me.mutation(api.onboarding.begin, { timezone: TZ });
  const messages = () => t.run((ctx) => ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', threadId)).collect());
  const lastBlock = async () => {
    const all = await messages();
    const b = [...all].reverse().find((m) => m.body.type === 'block');
    return b as Doc<'messages'> & { body: { type: 'block'; block: { kind: string; options?: { id: string }[] } } };
  };
  const answer = async (answer: Record<string, unknown>) => {
    // Compatibility fixture: a record saved by the previous form-based version.
    if (!await lastBlock()) await t.run(async ctx => {
      const row = (await ctx.db.query('onboarding').first())!;
      await ctx.db.patch(row._id, { step: 'family', family: { step: 'who' } });
      await postStep(ctx, (await ctx.db.get(row._id))!, row.startedAt);
    });
    return me.mutation(api.chat.answerBlock, { messageId: (await lastBlock())._id, answer, via: 'text' });
  };
  const lastCards = async () => (await messages()).filter((m) => m.body.type === 'card').map((m) => (m.body as { card: { kind: string; offer?: string } }).card);
  return { t, me, settle, familyId, threadId, messages, lastBlock, answer, lastCards };
}

const texts = (ms: Doc<'messages'>[]) => ms.filter((m) => m.body.type === 'text').map((m) => (m.body as { text: string }).text);

describe('onboarding chat (Screen 13)', () => {
  test('begin opens the chat with the MEGA asking your name; chat.start doesn’t repeat it or add the generic greeting', async () => {
    const s = await fresh();
    expect(texts(await s.messages())).toEqual([fillCopy(G5_COPY.hello, { mega: 'Teal' }), G5_COPY.askName]);
    expect(await s.me.query(api.onboarding.state, {})).toEqual({ step: 'name', outcomes: {} });
    expect(await s.me.mutation(api.chat.start, {})).toEqual({ started: false });
    expect(await s.messages()).toHaveLength(2);
    expect(codeOf(await s.me.mutation(api.onboarding.begin, { timezone: TZ }).catch((e) => e))).toBe('VALIDATION');
  });

  test('the name comes from chat.send with no agent turn: "call me Sam" → Sam, then a conversation about the owner', async () => {
    const s = await fresh();
    await s.me.mutation(api.chat.send, { text: 'You can call me sam!', via: 'text' });
    await s.settle();
    expect(agentCalls).toBe(0);
    const me = await s.me.query(api.me.get, {});
    expect(me!.member.name).toBe('Sam');
    expect(me!.family.name).toBe('Sam’s family');
    expect(texts(await s.messages())).toContain(fillCopy(G5_COPY.niceToMeet, { name: 'Sam' }));
    expect(await s.lastCards()).toEqual([]);
    expect(await s.me.query(api.onboarding.state, {})).toEqual({ step: 'done', outcomes: {}, callMe: 'Sam' });
    expect(texts(await s.messages())).toContain(G5_COPY.meetAdmin);
    expect(await s.me.query(api.megaCreation.current, {})).toBeNull();
  });

  test('an unclear first message stays in chat and gets a friendly follow-up instead of a validation error', async () => {
    const s = await fresh();
    const sent = await s.me.mutation(api.chat.send, { text: 'I would like some help creating an assistant for my mother', via: 'text' });
    await s.settle();
    expect(texts(await s.messages())).toContain('I would like some help creating an assistant for my mother');
    expect(await s.me.query(api.chat.streamBody, { streamId: sent.streamId })).toMatchObject({ status: 'done', text: G5_COPY.nameConversationFallback });
    expect(codeOf(await s.me.mutation(api.onboarding.setName, { name: '   ' }).catch((e) => e))).toBe('VALIDATION');
    expect((await s.me.query(api.onboarding.state, {}))!.step).toBe('name');
  });

  test('a full introduction extracts the owner’s name, keeps the rest of the message and advances once', async () => {
    const s = await fresh();
    const introduction = "Hi Teal! I'm Brandon, and I'd like help making an assistant for my mother Lovie.";
    __setChatModelForTests(makeFakeChatModel(req => {
      expect(req.schema?.name).toBe('onboarding_name_reply');
      expect(req.messages.at(-1)?.content).toBe(introduction);
      return jsonReply({ name: 'Brandon', reply: 'Nice to meet you, Brandon.' });
    }));
    const sent = await s.me.mutation(api.chat.send, { text: introduction, via: 'text' });
    await s.settle();
    expect((await s.me.query(api.me.get, {}))!.member.name).toBe('Brandon');
    expect(texts(await s.messages())).toContain(introduction);
    expect(await s.me.query(api.chat.streamBody, { streamId: sent.streamId })).toMatchObject({ status: 'done', text: fillCopy(G5_COPY.niceToMeet, { name: 'Brandon' }) });
    expect(await s.lastCards()).toEqual([]);
  });

  test('questions and greetings are not saved as names; model failure still completes a useful reply', async () => {
    const s = await fresh();
    __setChatModelForTests(makeFakeChatModel(() => { throw new Error('model offline'); }));
    for (const text of ['Hi Teal', 'Can you help me?', 'I am a working mother']) {
      const sent = await s.me.mutation(api.chat.send, { text, via: 'text' });
      await s.settle();
      expect((await s.me.query(api.me.get, {}))!.member.name).toBe('');
      expect(await s.me.query(api.chat.streamBody, { streamId: sent.streamId })).toMatchObject({ status: 'done', text: G5_COPY.nameConversationFallback });
    }
    await s.me.mutation(api.chat.send, { text: 'Brandon', via: 'text' });
    await s.settle();
    expect((await s.me.query(api.onboarding.state, {}))!.step).toBe('done');
  });

  test('Not now on every offer never blocks: Gmail → calendar → schedule links → the family ask; chat.start re-shows the current card once', async () => {
    const s = await fresh();
    await s.me.mutation(api.onboarding.setName, { name: 'Sam' });
    // Existing installations can still be midway through the old connection sequence.
    await s.t.run(async ctx => {
      const row = (await ctx.db.query('onboarding').first())!;
      await ctx.db.patch(row._id, { step: 'gmail', finishedAt: undefined });
      await postStep(ctx, (await ctx.db.get(row._id))!, row.startedAt);
    });
    await s.me.mutation(api.onboarding.skip, { offer: 'gmail' });
    expect((await s.lastCards()).at(-1)).toEqual({ kind: 'connect', offer: 'calendar' });
    expect(await s.me.query(api.integrations.offer, { offer: 'gmail' })).toMatchObject({ state: 'skipped' });
    await s.me.mutation(api.onboarding.skip, { offer: 'calendar' });
    // The card got lost (an empty or scrolled-off thread): chat.start puts it back, once.
    await s.t.run(async (ctx) => {
      for (const m of await ctx.db.query('messages').collect()) if (m.body.type === 'card') await ctx.db.delete(m._id);
    });
    expect(await s.me.mutation(api.chat.start, {})).toEqual({ started: true });
    expect(await s.me.mutation(api.chat.start, {})).toEqual({ started: false });
    expect(await s.lastCards()).toEqual([{ kind: 'connect', offer: 'ics' }]);
    await s.me.action(api.integrations.addIcs, { url: 'https://calendar.example-league.test/fall.ics' });
    const state = await s.me.query(api.onboarding.state, {});
    expect(state).toMatchObject({ step: 'done', outcomes: { gmail: 'skipped', calendar: 'skipped', ics: 'connected' } });
    expect(texts(await s.messages()).at(-1)).toBe(MEGA_CREATION.start);
    expect(await s.t.run(ctx => ctx.db.query('megaDrafts').collect())).toHaveLength(1);
  });

  test('legacy saved family step adds a real kid with a MEGA and an invite, then "That’s everyone" finishes', async () => {
    const s = await fresh();
    await s.me.mutation(api.onboarding.setName, { name: 'Sam' });
    for (const offer of ['gmail', 'calendar', 'ics'] as const) await s.me.mutation(api.onboarding.skip, { offer });
    await s.answer({ optionIds: ['kid'] });
    await s.answer({ value: 'Robin' });
    expect((await s.lastBlock()).body.block.options!.map((o) => o.id)).toEqual(['daughter', 'son', 'child', 'other']);
    await s.answer({ optionIds: ['daughter'] });
    await s.answer({ optionIds: ['yes'] });
    await s.answer({ fields: { birthday: '2018-05-04', grade: '2nd', activities: 'soccer, drawing' } });
    await s.answer({ fields: { goal: 'Build confidence with schoolwork', firstTask: 'Suggest a short practice activity' } });
    await s.answer({ fields: { hex: '#8E6CE0', sticker: 'bolt', personality: 'cheerful', name: 'Zip' } });
    expect(agentCalls).toBe(0);
    const robin = await s.t.run(async (ctx) => (await ctx.db.query('members').collect()).find((m) => m.name === 'Robin')!);
    expect(robin).toMatchObject({ role: 'kid', birthday: '2018-05-04', grade: '2nd', activities: ['soccer', 'drawing'], hasMega: true });
    expect(robin.authId).toBeUndefined();
    const viewer = await s.me.query(api.me.get, {});
    expect(viewer!.isParentOf).toContain(robin._id);
    const mega = await s.t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', s.familyId).eq('ownerId', robin._id)).unique());
    expect(mega).toMatchObject({ name: 'Zip', look: { hex: '#8E6CE0', sticker: 'bolt' }, personality: 'cheerful' });
    expect(await s.t.run((ctx) => ctx.db.query('kidControls').withIndex('by_family_member', (q) => q.eq('familyId', s.familyId).eq('memberId', robin._id)).unique())).not.toBeNull();
    const all = await s.messages();
    expect(all.some((m) => m.body.type === 'block' && m.body.block.kind === 'invite' && m.body.block.memberId === robin._id)).toBe(true);
    // The invite itself works for the admin (the block's QR/link comes from invites.create).
    expect((await s.me.mutation(api.invites.create, { memberId: robin._id })).url).toContain('mega://join/');
    await s.answer({ optionIds: ['done'] });
    expect(await s.me.query(api.onboarding.state, {})).toMatchObject({ step: 'done' });
    expect(texts(await s.messages()).at(-1)).toBe(G5_COPY.familyAllSet);
  });

  test('legacy "Just me for now" finishes; an adult can be added without a MEGA ("Not yet")', async () => {
    const s = await fresh();
    await s.me.mutation(api.onboarding.setName, { name: 'Sam' });
    for (const offer of ['gmail', 'calendar', 'ics'] as const) await s.me.mutation(api.onboarding.skip, { offer });
    await s.answer({ optionIds: ['other'] });
    await s.answer({ value: 'Alex' });
    await s.answer({ optionIds: ['partner'] });
    await s.answer({ optionIds: ['no'] });
    const alex = await s.t.run(async (ctx) => (await ctx.db.query('members').collect()).find((m) => m.name === 'Alex')!);
    expect(alex).toMatchObject({ role: 'adult', hasMega: false });
    await s.answer({ optionIds: ['more'] });
    await s.answer({ optionIds: ['justMe'] });
    expect((await s.me.query(api.onboarding.state, {}))!.step).toBe('done');
    // After onboarding, block answers go back to the agent as usual.
  });

  test('kids and members who joined never get the admin onboarding (state is null; chat.start is the normal one)', async () => {
    const t = convexTest(schema, modules);
    registerPersistentTextStreaming(t);
    await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    expect(await t.withIdentity({ subject: 'sample:twin1' }).query(api.onboarding.state, {})).toBeNull();
    expect(await t.withIdentity({ subject: 'sample:partner' }).query(api.onboarding.state, {})).toBeNull();
    expect(codeOf(await t.withIdentity({ subject: 'sample:twin1' }).mutation(api.onboarding.setName, { name: 'X' }).catch((e) => e))).toBe('VALIDATION');
  });
});

describe('family.add', () => {
  test('admin only; creates the member with the relationship both ways and kid defaults', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    const m = members as unknown as Record<string, Id<'members'>>;
    expect(codeOf(await t.withIdentity({ subject: 'sample:partner' }).mutation(api.family.add, { name: 'Kai', role: 'kid', relationship: 'son' }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await t.withIdentity({ subject: 'sample:twin1' }).mutation(api.family.add, { name: 'Kai', role: 'kid', relationship: 'son' }).catch((e) => e))).toBe('FORBIDDEN');
    const { memberId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.family.add, { name: 'Kai', role: 'kid', relationship: 'son', mega: { name: 'Pip', look: { hex: '#FF9AD5', sticker: 'star' }, personality: 'funny' } });
    const rels = await t.run((ctx) => ctx.db.query('relationships').withIndex('by_family_from', (q) => q.eq('familyId', familyId)).collect());
    expect(rels.filter((r) => r.to === memberId && r.kind === 'parent').map((r) => r.from).sort()).toEqual([m.admin, m.partner].sort());
    expect(rels.some((r) => r.from === memberId && r.to === m.admin && r.kind === 'son')).toBe(true);
    expect(await t.run((ctx) => ctx.db.query('settings').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', memberId)).unique())).toMatchObject({ notify: { dailyCap: expect.any(Number) } });
    expect(codeOf(await t.withIdentity({ subject: 'sample:admin' }).mutation(api.family.add, { name: '', role: 'kid', relationship: 'son' }).catch((e) => e))).toBe('VALIDATION');
  });
});

describe('nightly profiler (invariant 12)', () => {
  async function withMemories() {
    const t = convexTest(schema, modules);
    registerPersistentTextStreaming(t);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    const m = members as unknown as Record<string, Id<'members'>>;
    const now = await t.run(async (ctx) => {
      const c = await ctx.db.query('clocks').withIndex('by_family', (q) => q.eq('familyId', familyId)).unique();
      return Date.now() + (c?.offsetMs ?? 0);
    });
    const mem = (over: Partial<Doc<'memories'>>) =>
      t.run((ctx) =>
        ctx.db.insert('memories', {
          familyId,
          scope: 'personal',
          scopeKey: `${familyId}:personal:${m.partner}`,
          about: [m.partner],
          kind: 'routine',
          text: 'Partner has soccer practice Mondays and Wednesdays at 4:30',
          source: { kind: 'message' },
          trigger: 'stated',
          confidence: 0.8,
          confirmed: false,
          sensitive: false,
          pinned: false,
          createdAt: now - 3_600_000,
          lastUsedAt: now,
          ...over,
        } as Doc<'memories'>),
      );
    return { t, familyId, m, now, mem };
  }

  test('reads only the member’s own non-sensitive memories; applies, asks or drops by confidence; once per day', async () => {
    const s = await withMemories();
    const soccer = await s.mem({});
    await s.mem({ text: 'Partner takes heart medication', sensitive: true });
    await s.mem({ scopeKey: `${s.familyId}:personal:${s.m.admin}`, about: [s.m.admin], text: 'Admin secret plan' });
    const grade = await s.mem({ kind: 'fact', text: 'Partner coaches the U9 team', createdAt: s.now - 1_800_000 });
    let seen: ChatModelRequest | null = null;
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        seen = req;
        return jsonReply({
          updates: [
            { memoryIndex: 0, kind: 'routine', key: '', value: 'Soccer practice', days: [1, 3], time: '16:30', confidence: 0.9, question: '' },
            { memoryIndex: 1, kind: 'basic', key: 'team', value: 'U9 coach', days: [], time: '', confidence: 0.6, question: 'Do you still coach the U9 team?' },
            { memoryIndex: 1, kind: 'basic', key: 'shoe', value: '9', days: [], time: '', confidence: 0.2, question: '' },
            { memoryIndex: 7, kind: 'basic', key: 'x', value: 'out of range', days: [], time: '', confidence: 1, question: '' },
          ],
        });
      }),
    );
    const day = localDate(s.now, TZ);
    await s.t.action(internal.profiler.runMember, { familyId: s.familyId, memberId: s.m.partner, day });
    const prompt = JSON.stringify(seen);
    expect(prompt).toContain('soccer practice');
    expect(prompt).not.toContain('medication');
    expect(prompt).not.toContain('Admin secret plan');
    const profile = await s.t.run((ctx) => ctx.db.query('profiles').withIndex('by_family_member', (q) => q.eq('familyId', s.familyId).eq('memberId', s.m.partner)).unique());
    expect(profile!.routines).toEqual([{ text: 'Soccer practice', days: [1, 3], time: '16:30', confirmed: true }]);
    expect(profile!.basics.team).toBeUndefined();
    expect(profile!.checkQuestions.map((q) => [q.memoryId, q.question])).toEqual([[grade, 'Do you still coach the U9 team?']]);
    const runs = await s.t.run((ctx) => ctx.db.query('profilerRuns').collect());
    expect(runs).toMatchObject([{ memberId: s.m.partner, day, applied: 1, asked: 1, dropped: 1 }]);
    expect(runs[0].memoriesRead).toBeGreaterThanOrEqual(2); // + whatever the seed's day already holds about Partner
    await s.t.action(internal.profiler.runMember, { familyId: s.familyId, memberId: s.m.partner, day });
    expect(await s.t.run((ctx) => ctx.db.query('profilerRuns').collect())).toHaveLength(1);
    expect(soccer).toBeDefined();
  });

  test('check questions: posted inside the ask window, at most one a day, answered by rule (Yes confirms, Not anymore retires)', async () => {
    const s = await withMemories();
    const a = await s.mem({ text: 'Partner walks the dog at 7' });
    const b = await s.mem({ text: 'Partner works from home Fridays' });
    const day = localDate(s.now, TZ);
    const askAt = zonedInstant(day, 17 * 60, TZ);
    await s.t.run(async (ctx) => {
      const p = (await ctx.db.query('profiles').withIndex('by_family_member', (q) => q.eq('familyId', s.familyId).eq('memberId', s.m.partner)).unique())!;
      await ctx.db.patch(p._id, { checkQuestions: [{ memoryId: a, question: 'Still walking the dog at 7?', askAfter: 0 }, { memoryId: b, question: 'Still home on Fridays?', askAfter: 0 }] });
      const c = (await ctx.db.query('clocks').withIndex('by_family', (q) => q.eq('familyId', s.familyId)).unique())!;
      await ctx.db.patch(c._id, { offsetMs: c.offsetMs + (askAt - s.now) });
    });
    await s.t.mutation(internal.profiler.sweep, {});
    await s.t.mutation(internal.profiler.sweep, {});
    const blocks = await s.t.run(async (ctx) => (await ctx.db.query('messages').collect()).filter((m) => m.body.type === 'block' && m.body.block.kind === 'choice' && m.body.block.prompt.startsWith('Still')));
    expect(blocks).toHaveLength(PROFILER.maxCheckQuestionsPerMemberPerDay);
    await s.t.withIdentity({ subject: 'sample:partner' }).mutation(api.chat.answerBlock, { messageId: blocks[0]._id, answer: { optionIds: ['no'] }, via: 'text' });
    const memory = await s.t.run((ctx) => ctx.db.get(a));
    expect(memory).toMatchObject({ confirmed: false });
    expect(memory!.validUntil).toBeDefined();
  });
});
