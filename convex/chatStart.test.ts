/// <reference types="vite/client" />
// Owner, Oct 28: "There should never be 'No messages yet, say hello'. MEGAs are proactive... start off with a
// get to know you prompt and for kids it can start off by telling them how to use the app or how it can help
// them." `chat.start` fills an empty thread: a kid gets the KidsIntro messages (config, no model call); an
// adult gets a greeting their MEGA writes through the agent loop, then a choice block.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ADULT_STARTER, KID_INTRO } from '../shared/config/starters';
import { __setChatModelForTests } from './adapters/registry';
import { jsonReply, makeFakeChatModel, textReply } from './adapters/fakeChatModel';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

async function seededWithEmptyThread(who: Key) {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const { familyId, members: raw } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const members = raw as unknown as Record<Key, Id<'members'>>;
  // Start from a truly empty thread for this member, whatever the seed put there.
  await t.run(async (ctx) => {
    const thread = await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members[who])).unique();
    if (!thread) return;
    const msgs = await ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id)).collect();
    for (const m of msgs) await ctx.db.delete(m._id);
  });
  const threadMessages = async () =>
    t.run(async (ctx) => {
      const thread = await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members[who])).unique();
      if (!thread) return [];
      return ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id)).order('asc').collect();
    });
  return { t, familyId, members, as: t.withIdentity({ subject: `sample:${who}` }), threadMessages };
}

describe('chat.start: a kid’s first open (board KidsIntro)', () => {
  test('writes the hello, the "Here’s what we can do" card and the tip, from their own MEGA, with no model call', async () => {
    const { t, as, threadMessages } = await seededWithEmptyThread('twin2');
    let modelCalls = 0;
    __setChatModelForTests(makeFakeChatModel(() => (modelCalls++, textReply('should not be called'))));

    expect(await as.mutation(api.chat.start, {})).toEqual({ started: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const msgs = await threadMessages();
    expect(msgs.map((m) => m.body.type)).toEqual(['text', 'card', 'text']);
    expect(msgs.every((m) => m.author.kind === 'mega')).toBe(true);
    const hello = msgs[0].body.type === 'text' ? msgs[0].body.text : '';
    expect(hello).toBe('Hi Twin 2! I’m Sunny, your MEGA. Admin made me just for you.');
    expect(msgs[1].body.type === 'card' && msgs[1].body.card.kind).toBe('intro');
    expect(msgs[2].body.type === 'text' && msgs[2].body.text).toBe(KID_INTRO.tip.replace('{mega}', 'Sunny'));
    expect(modelCalls).toBe(0);
  });

  test('is idempotent: a second call writes nothing', async () => {
    const { as, threadMessages } = await seededWithEmptyThread('twin2');
    await as.mutation(api.chat.start, {});
    const before = (await threadMessages()).length;
    expect(await as.mutation(api.chat.start, {})).toEqual({ started: false });
    expect((await threadMessages()).length).toBe(before);
  });

  test('still starts when MEGA cards are already waiting (the seed posts chore and bedtime cards), once', async () => {
    const { t, familyId, members, as, threadMessages } = await seededWithEmptyThread('twin2');
    await t.run(async (ctx) => {
      const thread = (await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.twin2)).unique())!;
      const mega = (await ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.twin2)).unique())!;
      await ctx.db.insert('messages', { familyId, threadId: thread._id, at: Date.now() - 1000, author: { kind: 'mega', id: mega._id }, via: 'text', body: { type: 'notice', text: 'A card from earlier' }, chips: [] });
    });
    expect(await as.mutation(api.chat.start, {})).toEqual({ started: true });
    expect((await threadMessages()).some((m) => m.body.type === 'card' && m.body.card.kind === 'intro')).toBe(true);
    expect(await as.mutation(api.chat.start, {})).toEqual({ started: false });
  });

  test('never starts over a member who is already talking', async () => {
    const { t, familyId, members, as, threadMessages } = await seededWithEmptyThread('twin2');
    await t.run(async (ctx) => {
      const thread = (await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.twin2)).unique())!;
      await ctx.db.insert('messages', { familyId, threadId: thread._id, at: Date.now(), author: { kind: 'member', id: members.twin2 }, via: 'text', body: { type: 'text', text: 'hi' }, chips: [] });
    });
    expect(await as.mutation(api.chat.start, {})).toEqual({ started: false });
    expect((await threadMessages()).length).toBe(1);
  });
});

describe('chat.start: an adult’s first open', () => {
  test('their MEGA writes a greeting through the agent loop, then asks one question with choice buttons', async () => {
    const { t, as, threadMessages } = await seededWithEmptyThread('partner');
    const prompts: string[] = [];
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema) return jsonReply({ operations: [] });
        prompts.push(req.messages.map((m) => m.content).join('\n'));
        return textReply('Hi Partner, I’m Coral. I see you’ve got a work dinner Thursday.');
      }),
    );

    expect(await as.mutation(api.chat.start, {})).toEqual({ started: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const msgs = await threadMessages();
    expect(msgs.map((m) => m.body.type)).toEqual(['text', 'block']);
    expect(msgs[0].body.type === 'text' && msgs[0].body.text).toBe('Hi Partner, I’m Coral. I see you’ve got a work dinner Thursday.');
    const block = msgs[1].body.type === 'block' ? msgs[1].body.block : null;
    expect(block?.kind).toBe('choice');
    expect(block?.kind === 'choice' && block.prompt).toBe(ADULT_STARTER.question);
    expect(block?.kind === 'choice' && block.options.map((o) => o.label)).toEqual(ADULT_STARTER.options.map((o) => o.label));
    expect(prompts.some((p) => p.includes('just opened MEGA for the first time'))).toBe(true);
  });

  test('if the model gives nothing back, the greeting falls back to config instead of an empty message', async () => {
    const { t, as, threadMessages } = await seededWithEmptyThread('partner');
    __setChatModelForTests(makeFakeChatModel((req) => (req.schema ? jsonReply({ operations: [] }) : { text: '', toolCalls: [], usage: { tokensIn: 1, tokensOut: 1 }, finishReason: 'stop' })));
    await as.mutation(api.chat.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = (await threadMessages())[0];
    expect(first.body.type === 'text' && first.body.text).toBe('Hi Partner, I’m Coral, your MEGA. I already know a little about the family, and I’d like to learn more about you.');
  });
});

describe('GD review (LOW): the kid intro reads as a whole sentence even with no admin to name', () => {
  test('no admin in the family: the hello never has an empty name or a double space', async () => {
    const { t, members, as, threadMessages } = await seededWithEmptyThread('twin2');
    await t.run((ctx) => ctx.db.patch(members.admin, { role: 'adult' }));
    await as.mutation(api.chat.start, {});
    const first = (await threadMessages())[0];
    const text = first.body.type === 'text' ? first.body.text : '';
    expect(text).not.toMatch(/ {2}/);
    expect(text.startsWith('Hi Twin 2!')).toBe(true);
    expect(text).not.toMatch(/(^|\s)made me/); // no sentence that starts with a missing name
  });
});
