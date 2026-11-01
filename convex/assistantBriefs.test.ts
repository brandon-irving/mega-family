import { activeDraft } from './model/megaCreation';
/// <reference types="vite/client" />
import { register as registerStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ASSISTANT_BRIEF as C } from '../shared/config/assistantBrief';
import { api, internal } from './_generated/api';
import { __setChatModelForTests } from './adapters/registry';
import { makeFakeChatModel, textReply } from './adapters/fakeChatModel';
import { acceptedBriefContext } from './model/assistantBriefs';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const proposed = { context: 'A busy parent', goal: 'Promote a children’s book', firstTask: 'Draft three book launch posts', proactive: 'Look for useful next steps' };
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
afterEach(() => { __setChatModelForTests(null); vi.useRealTimers(); });

async function setup(join = true) {
  const t = convexTest(schema, modules);
  registerStreaming(t);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const admin = t.withIdentity({ subject: 'sample:admin' });
  const { memberId } = await admin.mutation(api.family.add, { name: 'Lovie', role: 'adult', relationship: 'partner' });
  await admin.mutation(api.assistantBriefs.save, { memberId, brief: proposed });
  const { url } = await admin.mutation(api.invites.create, { memberId });
  const owner = t.withIdentity({ subject: 'brief-owner' });
  if (join) {
    await owner.action(api.invites.redeem, { token: url });
    await owner.mutation(api.chat.start, {});
  }
  const row = () => t.run(ctx => ctx.db.query('assistantBriefs').withIndex('by_family_member', q => q.eq('familyId', familyId).eq('memberId', memberId)).unique());
  const messages = () => t.run(async ctx => {
    const thread = await ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', familyId).eq('ownerId', memberId)).unique();
    return thread ? ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', familyId).eq('threadId', thread._id)).collect() : [];
  });
  const answer = async (answer: { optionIds?: string[]; fields?: Record<string, string>; skipped?: true }) => owner.mutation(api.chat.answerBlock, { messageId: (await row())!.blockMessageId!, answer, via: 'text' });
  const context = () => t.run(ctx => acceptedBriefContext(ctx, familyId, memberId));
  const modelContext = async () => {
    const viewer = (await owner.query(api.me.get, {}))!;
    const threadId = (await messages())[0].threadId;
    return t.query(internal.agent.context.buildContext, { familyId, memberId, megaId: viewer.mega!._id, threadId, userText: 'Help me' });
  };
  return { t, familyId, members, admin, owner, memberId, url, row, messages, answer, context, modelContext };
}

describe('assistant first-day brief', () => {
  test('Family → Add a person reuses setup and resumes without duplicate prompts or resetting progress', async () => {
    const s = await setup(false);
    await s.admin.mutation(api.onboarding.addPerson, {});
    const row = () => s.t.run(ctx => ctx.db.query('onboarding').withIndex('by_family_member', q => q.eq('familyId', s.familyId).eq('memberId', s.members.admin)).unique());
    expect((await row())!.step).toBe('done');
    const draft = () => s.t.run(async ctx => activeDraft(ctx, (await ctx.db.get(s.members.admin))!));
    const first = (await draft())!;
    await s.admin.mutation(api.onboarding.addPerson, {});
    expect((await draft())!._id).toBe(first._id);
    await expect(s.t.withIdentity({ subject: 'sample:partner' }).mutation(api.onboarding.addPerson, {})).rejects.toThrow();
  });

  test('invites reveal no brief; first meeting attributes suggestions and resumes without duplicate messages', async () => {
    const s = await setup(false);
    expect(JSON.stringify(await s.t.query(api.invites.preview, { token: s.url }))).not.toContain(proposed.goal);
    await s.owner.action(api.invites.redeem, { token: s.url });
    await s.owner.mutation(api.chat.start, {});
    const before = await s.messages();
    expect(JSON.stringify(before)).toContain('first-day brief');
    expect(JSON.stringify(before)).toContain(proposed.goal);
    await s.owner.mutation(api.chat.start, {});
    expect(await s.messages()).toHaveLength(before.length);
    expect(await s.context()).toBe('');
    expect((await s.modelContext()).profileCard).not.toContain(proposed.goal);
    expect((await s.modelContext()).creationContext).toContain('pending');
  });

  test('accepting activates context without starting a task; repeat answers are idempotent', async () => {
    const s = await setup();
    const id = (await s.row())!.blockMessageId!;
    const input = { messageId: id, answer: { optionIds: ['accept'] }, via: 'text' as const };
    await s.owner.mutation(api.chat.answerBlock, input);
    const count = (await s.messages()).length;
    await s.owner.mutation(api.chat.answerBlock, input);
    expect(await s.messages()).toHaveLength(count);
    expect(await s.row()).toMatchObject({ status: 'accepted', step: 'ready', approved: proposed });
    const messages = await s.messages();
    const original = messages.find(m => m._id === id)!;
    const answer = messages.find(m => m.body.type === 'answer' && m.body.blockMessageId === id)!;
    expect(answer.at).toBeGreaterThan(original.at);
    expect(await s.context()).toContain(proposed.firstTask);
    expect(await s.t.run(ctx => ctx.db.system.query('_scheduled_functions').collect())).toHaveLength(0);
  });

  test('private edits inform only the owner; creator sees original suggestions and cannot overwrite them', async () => {
    const s = await setup();
    await s.answer({ optionIds: ['edit'] });
    await s.owner.mutation(internal.megaCreation.execute, { name: 'mega_brief_review', argumentsJson: JSON.stringify({ brief: { goal: 'My private career change', firstTask: 'Help plan my study time' } }) });
    await s.answer({ optionIds: ['accept'] });
    expect(await s.context()).toContain('My private career change');
    expect(await s.context()).not.toContain(proposed.goal);
    const creatorView = await s.admin.query(api.assistantBriefs.forMember, { memberId: s.memberId });
    expect(creatorView).toMatchObject({ proposed, status: 'accepted', canEdit: false });
    expect(JSON.stringify(creatorView)).not.toContain('career');
    expect(JSON.stringify((await s.modelContext()).recentThread)).not.toContain(proposed.goal);
    await expect(s.admin.mutation(api.assistantBriefs.save, { memberId: s.memberId, brief: proposed })).rejects.toThrow();
  });

  test('declining does not notify creator; asking for help sends only an explicit request and permits a revised suggestion', async () => {
    const s = await setup();
    const adminMessages = () => s.t.run(ctx => ctx.db.query('messages').collect()).then(rows => rows.filter(m => m.body.type === 'text' && m.body.text.includes('would like another suggestion')));
    await s.answer({ optionIds: ['different'] });
    expect(await adminMessages()).toHaveLength(0);
    expect(await s.context()).toBe('');
    await s.answer({ optionIds: ['help'] });
    expect(await adminMessages()).toHaveLength(1);
    await s.admin.mutation(api.assistantBriefs.save, { memberId: s.memberId, brief: { ...proposed, goal: 'Plan the school week' } });
    expect(await s.row()).toMatchObject({ status: 'pending', step: 'review', helpRequested: false });
    expect(await s.context()).toBe('');
  });

  test('start fresh with an owner-authored brief, or opt into the existing email connection offer', async () => {
    const s = await setup();
    await s.answer({ optionIds: ['different'] });
    await s.answer({ optionIds: ['own'] });
    await s.owner.mutation(internal.megaCreation.execute, { name: 'mega_brief_review', argumentsJson: JSON.stringify({ brief: { goal: 'Organize my week' } }) });
    await s.answer({ optionIds: ['accept'] });
    await s.answer({ optionIds: ['email'] });
    expect(await s.row()).toMatchObject({ status: 'accepted', step: 'done' });
    expect((await s.messages()).some(m => m.body.type === 'card' && m.body.card.kind === 'connect' && m.body.card.offer === 'gmail')).toBe(true);
    expect(await s.context()).not.toContain('children');
  });

  test('first task uses the existing real agent path exactly once, with the accepted task as input', async () => {
    const s = await setup();
    const calls: string[] = [];
    __setChatModelForTests(makeFakeChatModel(request => {
      calls.push(JSON.stringify(request));
      return textReply('Here are three draft post ideas.');
    }));
    await s.answer({ optionIds: ['accept'] });
    const id = (await s.row())!.blockMessageId!;
    const input = { messageId: id, answer: { optionIds: ['start'] }, via: 'text' as const };
    const first = await s.owner.mutation(api.chat.answerBlock, input);
    expect(first.streamId).toBeTruthy();
    await s.owner.mutation(api.chat.answerBlock, input);
    const scheduled = await s.t.run(ctx => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled.filter(s => s.name === 'chat:generateReply')).toHaveLength(1);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.some(call => call.includes(proposed.firstTask))).toBe(true);
    expect(await s.row()).toMatchObject({ step: 'done' });
  });

  test('rejects malformed, oversized, unauthorized, and cross-family changes', async () => {
    const s = await setup(false);
    await expect(s.admin.mutation(api.assistantBriefs.save, { memberId: s.memberId, brief: { ...proposed, goal: 'x'.repeat(C.maxFieldLength + 1) } })).rejects.toThrow();
    const partner = s.t.withIdentity({ subject: 'sample:partner' });
    await expect(partner.query(api.assistantBriefs.forMember, { memberId: s.memberId })).rejects.toThrow();
    await expect(partner.mutation(api.assistantBriefs.save, { memberId: s.memberId, brief: proposed })).rejects.toThrow();
    const outsider = s.t.withIdentity({ subject: 'outsider' });
    await outsider.mutation(api.onboarding.begin, { timezone: 'America/New_York' });
    await expect(outsider.query(api.assistantBriefs.forMember, { memberId: s.memberId })).rejects.toThrow();
    await expect(outsider.mutation(api.assistantBriefs.save, { memberId: s.memberId, brief: proposed })).rejects.toThrow();
  });

  test('ordinary chat can discuss a pending brief without activating it', async () => {
    const s = await setup();
    await s.owner.mutation(api.chat.send, { text: 'What are you working on?', via: 'text' });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.row()).toMatchObject({ status: 'pending' });
    expect(await s.context()).toBe('');
    expect(JSON.stringify(await s.messages())).not.toContain(C.pendingHint);
    expect((await s.modelContext()).profileCard).not.toContain(proposed.goal);
  });

  test.each([['Yes, thank you!', 'accepted'], ['No thanks', 'declined']])('review accepts the natural reply %s, including Talk', async (text, status) => {
    const s = await setup();
    const reply = await s.owner.mutation(api.chat.send, { text, via: 'voice' });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.row()).toMatchObject({ status });
    const stream = await s.owner.query(api.chat.streamBody, { streamId: reply.streamId });
    expect(stream.status).toBe('done');
    expect(stream.text).toBe(status === 'accepted' ? C.accepted : C.declined);
  });
});
