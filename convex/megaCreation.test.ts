/// <reference types="vite/client" />
import { register as registerStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { __setChatModelForTests } from './adapters/registry';
import { makeFakeChatModel, toolCallReply, textReply, jsonReply } from './adapters/fakeChatModel';
import { activeDraft } from './model/megaCreation';
import { creationMcp } from './model/creationMcp';
import schema from './schema';
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
afterEach(() => { __setChatModelForTests(null); vi.useRealTimers(); });
async function setup() {
  const t = convexTest(schema, modules); registerStreaming(t);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const admin = t.withIdentity({ subject: 'sample:admin' });
  const call = async (name: string, args = {}) => JSON.parse(await admin.mutation(internal.megaCreation.execute, { name, argumentsJson: JSON.stringify(args) }));
  const draft = () => t.run(async ctx => activeDraft(ctx, (await ctx.db.get(members.admin))!));
  const count = () => t.run(ctx => ctx.db.query('members').collect()).then(rows => rows.length);
  return { t, familyId, members, admin, call, draft, count };
}
const mother = { target: 'new', name: 'Lovie', role: 'adult', relationship: 'parent', megaName: 'Coral', hex: 'coral', sticker: 'heart', personality: 'calm' };

test('typed mother answer enters the agent tools; conversation gathers details without making a person or forms', async () => {
  const s = await setup(); const count = await s.count();
  await s.admin.mutation(api.onboarding.addPerson, {});
  const first = await s.draft();
  await s.admin.mutation(api.onboarding.addPerson, {});
  expect((await s.draft())!._id).toBe(first!._id);
  __setChatModelForTests(makeFakeChatModel((request) => {
    if (request.schema) return jsonReply({ operations: [] });
    const toolResult = request.messages.find(m => m.role === 'tool');
    return toolResult ? textReply('What should I call your mother?') : toolCallReply([{ id: 'mother', name: 'mega_draft_update', arguments: { target: 'new', role: 'adult', relationship: 'parent' } }]);
  }));
  await s.admin.mutation(api.chat.send, { text: 'This is for my mother', via: 'text' });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.draft())!.data).toMatchObject({ target: 'new', role: 'adult', relationship: 'parent' });
  expect(await s.count()).toBe(count);
  const d = await s.call('mega_draft_update', { name: 'Lovie', brief: { context: 'Working mother', goal: 'Plan a less stressful week' } });
  const continued = await s.call('mega_draft_update', { draftId: d.draftId, brief: { context: 'Working mother in Florida', firstTask: 'Suggest a weekly plan' } });
  expect(continued.data.brief).toMatchObject({ goal: 'Plan a less stressful week', context: 'Working mother in Florida', firstTask: 'Suggest a weekly plan' });
  expect(await s.count()).toBe(count);
});

test('review includes appearance, skip brief works, confirmation creates once and never sends invite', async () => {
  const s = await setup(); const count = await s.count();
  const d = await s.call('mega_draft_update', { ...mother, brief: null });
  const review = await s.call('mega_draft_review', { draftId: d.draftId });
  expect(review.ui).toMatchObject({ kind: 'megaDraft', data: { megaName: 'Coral', hex: '#F2766B', sticker: 'heart' } });
  expect(await s.count()).toBe(count);
  const args = { draftId: d.draftId, revision: review.revision, confirmed: true };
  const first = await s.call('mega_draft_confirm', args);
  const twice = await s.call('mega_draft_confirm', args);
  expect(first.memberId).toBe(twice.memberId);
  expect(await s.count()).toBe(count + 1);
  expect(await s.t.run(ctx => ctx.db.query('invites').collect())).toHaveLength(0);
  expect(await s.t.run(ctx => ctx.db.query('assistantBriefs').collect())).toHaveLength(0);
});

test('changing a reviewed draft invalidates old confirmation; self modifies existing MEGA and keeps member count', async () => {
  const s = await setup(); const count = await s.count();
  const d = await s.call('mega_draft_update', { target: 'self', megaName: 'Orbit', hex: 'violet' });
  const review = await s.call('mega_draft_review', { draftId: d.draftId });
  await s.call('mega_draft_update', { draftId: d.draftId, sticker: 'star' });
  await expect(s.call('mega_draft_confirm', { draftId: d.draftId, revision: review.revision, confirmed: true })).rejects.toThrow();
  const next = await s.call('mega_draft_review', { draftId: d.draftId });
  const before = await s.admin.query(api.me.get, {});
  const messageId = (await s.draft())!.reviewMessageId!;
  await s.admin.mutation(api.chat.answerBlock, { messageId, answer: { value: 'confirm' }, via: 'text' });
  await s.admin.mutation(api.chat.answerBlock, { messageId, answer: { value: 'confirm' }, via: 'text' });
  const after = await s.admin.query(api.me.get, {});
  expect(next.ui.data.target).toBe('self');
  expect(after!.mega!._id).toBe(before!.mega!._id);
  expect(after!.mega).toMatchObject({ name: 'Orbit', look: { hex: '#8E6CE0', sticker: 'star' } });
  expect(await s.count()).toBe(count);
});

test('typed confirmation works only on a current review', async () => {
  const s = await setup(); const d = await s.call('mega_draft_update', mother);
  await s.call('mega_draft_review', { draftId: d.draftId });
  const sent = await s.admin.mutation(api.chat.send, { text: 'Yes, please', via: 'voice' });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await s.draft()).toBeNull();
  expect(await s.admin.query(api.chat.streamBody, { streamId: sent.streamId })).toMatchObject({ status: 'done', text: expect.stringContaining('ready') });
  const created = await s.t.run(ctx => ctx.db.get(d.draftId));
  expect(created).toMatchObject({ status: 'created' });
});

test('no cross-member access, no kid creation, adults cannot add others or restyle joined people', async () => {
  const s = await setup(); const d = await s.call('mega_draft_update', mother);
  for (const subject of ['sample:partner', 'sample:twin1']) {
    const caller = s.t.withIdentity({ subject });
    await expect(caller.mutation(internal.megaCreation.execute, { name: 'mega_draft_update', argumentsJson: JSON.stringify({ draftId: d.draftId, name: 'Hijacked' }) })).rejects.toThrow();
  }
  await expect(s.call('mega_draft_update', { draftId: d.draftId, target: 'existing', memberId: s.members.partner })).rejects.toThrow();
  await expect(s.t.withIdentity({ subject: 'sample:partner' }).mutation(internal.megaCreation.execute, { name: 'mega_draft_update', argumentsJson: JSON.stringify(mother) })).rejects.toThrow();
  await expect(s.t.mutation(internal.megaCreation.execute, { name: 'mega_draft_get', argumentsJson: '{}' })).rejects.toThrow();
});

test('MCP discovery, structured review, text fallback and errors use the same shared tool catalog', async () => {
  const list = await creationMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, vi.fn());
  expect(JSON.stringify(list)).toContain('mega_draft_update');
  const response = await creationMcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'mega_draft_review', arguments: { draftId: 'test' } } }, async () => ({ text: 'Review Coral for Lovie; reply confirm to create.', ui: { kind: 'megaDraft' } }));
  expect(response).toMatchObject({ result: { content: [{ type: 'text', text: expect.stringContaining('Coral') }], structuredContent: { ui: { kind: 'megaDraft' } } } });
  expect(await creationMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, vi.fn())).toBeNull();
  expect(await creationMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'delete_everything' } }, vi.fn())).toMatchObject({ error: { code: -32602 } });
});

test('MCP HTTP requires authentication, rejects hostile origins and executes with authenticated identity', async () => {
  const s = await setup();
  const request = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mega_draft_get', arguments: {} } }) };
  expect((await s.t.fetch('/mcp/mega-creation', request)).status).toBe(401);
  expect((await s.admin.fetch('/mcp/mega-creation', { ...request, headers: { ...request.headers, Origin: 'https://untrusted.example' } })).status).toBe(403);
  const allowed = await s.admin.fetch('/mcp/mega-creation', request);
  expect(allowed.status).toBe(200);
  expect(await allowed.json()).toMatchObject({ result: { structuredContent: { text: expect.stringContaining('No active draft') } } });
});

test('cancelled drafts never create a MEGA, and stale confirmation cannot revive one', async () => {
  const s = await setup(); const count = await s.count();
  const d = await s.call('mega_draft_update', mother);
  await s.call('mega_draft_review', { draftId: d.draftId });
  await s.call('mega_draft_cancel', { draftId: d.draftId });
  expect(await s.draft()).toBeNull();
  await expect(s.call('mega_draft_confirm', { draftId: d.draftId, revision: d.revision, confirmed: true })).rejects.toThrow();
  expect(await s.count()).toBe(count);
});

test('only a reply with a real suggestion gets Save idea; setup replies do not', async () => {
  const s = await setup();
  __setChatModelForTests(makeFakeChatModel(request => {
    if (request.schema) return jsonReply({ operations: [] });
    return request.messages.some(m => m.role === 'tool') ? textReply('Try preparing two simple meals on Sunday.')
      : toolCallReply([{ id: 'idea', name: 'ideas_suggest', arguments: { title: 'Sunday meal prep', text: 'Prepare two simple meals on Sunday.', category: 'meals' } }]);
  }));
  const sent = await s.admin.mutation(api.chat.send, { text: 'Suggest an easy meal routine', via: 'text' });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await s.t.run(ctx => ctx.db.get(sent.replyMessageId))).toMatchObject({ saveableIdea: true });
  expect((await s.t.run(ctx => ctx.db.get(sent.messageId)))!.saveableIdea).toBeUndefined();
  __setChatModelForTests(makeFakeChatModel(request => request.schema ? jsonReply({ operations: [] }) : textReply('What should I call her?')));
  const ordinary = await s.admin.mutation(api.chat.send, { text: 'I want to make a MEGA for my mother', via: 'text' });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.t.run(ctx => ctx.db.get(ordinary.replyMessageId)))!.saveableIdea).toBeUndefined();
});

test('live drafts are creator-private; own personalization is idempotent and never overwrites another draft', async () => {
  const s = await setup();
  await s.admin.mutation(api.megaCreation.personalize, {});
  const first = await s.draft();
  await s.admin.mutation(api.megaCreation.personalize, {});
  expect((await s.draft())!._id).toBe(first!._id);
  expect(await s.admin.query(api.megaCreation.current, {})).toMatchObject({ data: { target: 'self' }, status: 'draft' });
  expect(await s.t.withIdentity({ subject: 'sample:partner' }).query(api.megaCreation.current, {})).toBeNull();
  expect(await s.t.withIdentity({ subject: 'sample:twin1' }).query(api.megaCreation.current, {})).toBeNull();
  await s.call('mega_draft_update', mother);
  await s.admin.mutation(api.megaCreation.personalize, {});
  expect((await s.draft())!.data).toMatchObject({ target: 'new', name: 'Lovie' });
});

test('explicit teen age in the brief persists to the confirmed member without approving accounts',async()=>{
 const s=await setup();
 const d=await s.call('mega_draft_update',{...mother,name:'Anela',role:'kid',relationship:'daughter',accountConnections:'ask',brief:{context:'16 yr old high schooler who has piano classes'}});
 expect(d.data.ageGroup).toBe('teen');
 const review=await s.call('mega_draft_review',{draftId:d.draftId});
 const created=await s.call('mega_draft_confirm',{draftId:d.draftId,revision:review.revision,confirmed:true});
 const member=await s.t.run(ctx=>ctx.db.get(created.memberId));
 expect(member).toMatchObject({ageGroup:'teen',role:'kid'});
 expect(member).not.toHaveProperty('connectionsApprovedBy');
 vi.stubEnv('DEMO_MODE','true');
 try {
   await s.t.run(async ctx=>{await ctx.db.patch(created.memberId,{ageGroup:undefined});await ctx.db.insert('demoRuns',{familyId:s.familyId,ownerAuthId:'sample:admin',adminId:s.members.admin,key:'repair-test',date:'2026-11-02',createdAt:1,active:true,jobs:[]});});
   expect(await s.t.mutation(internal.demoConsole.repairAgeFromBrief,{memberId:created.memberId})).toEqual({changed:true,ageGroup:'teen'});
   expect(await s.t.run(ctx=>ctx.db.get(created.memberId))).not.toHaveProperty('connectionsApprovedBy');
 } finally {vi.unstubAllEnvs();}
});

test('child creation requires age, then teen permissions, before review or a stale confirmation', async () => {
  const s = await setup();
  const d = await s.call('mega_draft_update', { ...mother, name: 'Anela', role: 'kid', relationship: 'daughter' });
  await expect(s.call('mega_draft_review', { draftId: d.draftId })).rejects.toThrow(/how old/);
  await s.call('mega_draft_update', { draftId: d.draftId, ageGroup: 'teen' });
  await expect(s.call('mega_draft_review', { draftId: d.draftId })).rejects.toThrow(/approval first/);
  await s.call('mega_draft_update', { draftId: d.draftId, accountConnections: 'ask' });
  const review = await s.call('mega_draft_review', { draftId: d.draftId });
  expect(review.text).toContain('ask a parent first');
  // A review saved by an older client cannot skip the new requirements.
  await s.t.run(ctx => ctx.db.patch(d.draftId, { data: { ...review.data, accountConnections: undefined } }));
  await expect(s.call('mega_draft_confirm', { draftId: d.draftId, revision: review.revision, confirmed: true })).rejects.toThrow(/approval first/);
});

test('parent may approve teen connections during creation without connecting Google or sharing chat', async () => {
  const s = await setup();
  const d = await s.call('mega_draft_update', { ...mother, name: 'Anela', role: 'kid', relationship: 'daughter', ageGroup: 'teen', accountConnections: 'allow' });
  const review = await s.call('mega_draft_review', { draftId: d.draftId });
  expect(review.text).toContain('Google consent still required');
  const result = await s.call('mega_draft_confirm', { draftId: d.draftId, revision: review.revision, confirmed: true });
  expect(await s.t.run(ctx => ctx.db.get(result.memberId))).toMatchObject({ ageGroup: 'teen', connectionsApprovedBy: s.members.admin });
  const controls = await s.t.run(ctx => ctx.db.query('kidControls').collect());
  expect(controls.find(c => c.memberId === result.memberId)?.parentsCanReadChat).toBe(false);
  const integrations = await s.t.run(ctx => ctx.db.query('integrations').collect());
  expect(integrations.filter(i => i.memberId === result.memberId)).toHaveLength(0);
});

test('changing teen age to child clears connection approval and allows child review without Google permission', async () => {
  const s = await setup();
  const d = await s.call('mega_draft_update', { ...mother, name: 'Anela', role: 'kid', relationship: 'daughter', ageGroup: 'teen', accountConnections: 'allow' });
  const changed = await s.call('mega_draft_update', { draftId: d.draftId, ageGroup: 'child' });
  expect(changed.data.accountConnections).toBeUndefined();
  const review = await s.call('mega_draft_review', { draftId: d.draftId });
  const result = await s.call('mega_draft_confirm', { draftId: d.draftId, revision: review.revision, confirmed: true });
  expect(await s.t.run(ctx => ctx.db.get(result.memberId))).not.toHaveProperty('connectionsApprovedBy');
});

test('an admin who is not the teen’s parent cannot authorize connections in creation', async () => {
  const s = await setup();
  const d = await s.call('mega_draft_update', { ...mother, name: 'Anela', role: 'kid', relationship: 'other', ageGroup: 'teen', accountConnections: 'allow' });
  await expect(s.call('mega_draft_review', { draftId: d.draftId })).rejects.toThrow(/parent must/);
});
