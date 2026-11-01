/// <reference types="vite/client" />
import { register as registerStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { __setChatModelForTests } from './adapters/registry';
import { makeFakeChatModel, jsonReply } from './adapters/fakeChatModel';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); __setChatModelForTests(null); });
async function setup() {
  vi.stubEnv('DEMO_MODE', 'true');
  const t = convexTest(schema, modules);
  registerStreaming(t);
  const seed = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const admin = t.withIdentity({ subject: 'sample:admin' });
  return { t, admin, ...seed };
}

test('fresh admin gets real initial onboarding, no copied data; return restores original and resume keeps progress', async () => {
  const { t, admin, members, familyId } = await setup();
  const original = await admin.query(api.me.get, {});
  expect(await admin.query(api.demo.profile, {})).toEqual({ active: false, canResume: false });
  await admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.admin });
  const fresh = (await admin.query(api.me.get, {}))!;
  expect(fresh.member).toMatchObject({ role: 'admin', name: '' });
  expect(fresh.member.familyId).not.toBe(familyId);
  expect(fresh.family.timezone).toBe(original!.family.timezone);
  expect(await admin.query(api.onboarding.state, {})).toMatchObject({ step: 'name' });
  expect(await admin.query(api.demo.profile, {})).toMatchObject({ active: true, canResume: false });
  await t.run(async ctx => {
    expect(await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', fresh.family._id)).collect()).toHaveLength(1);
    expect(await ctx.db.query('integrations').withIndex('by_family', q => q.eq('familyId', fresh.family._id)).collect()).toHaveLength(0);
    const messages = (await ctx.db.query('messages').collect()).filter(m => m.familyId === fresh.family._id);
    expect(messages).toHaveLength(2); // introduction and the first name question
    expect(JSON.stringify(messages)).toContain('what should I call you');
    expect(await ctx.db.get(familyId)).not.toBeNull();
  });
  await admin.mutation(api.onboarding.setName, { name: 'Demo Brandon' });
  await admin.mutation(api.demo.switchProfile, { mode: 'return', expectedMemberId: fresh.member._id });
  expect(await admin.query(api.me.get, {})).toEqual(original);
  expect(await admin.query(api.demo.profile, {})).toEqual({ active: false, canResume: true });
  await admin.mutation(api.demo.switchProfile, { mode: 'resume', expectedMemberId: members.admin });
  expect((await admin.query(api.me.get, {}))!.member).toMatchObject({ _id: fresh.member._id, name: 'Demo Brandon' });
});

test('repeat taps are a no-op; fresh run replaces only resume destination, never original family', async () => {
  const { t, admin, members } = await setup();
  const args = { mode: 'fresh' as const, expectedMemberId: members.admin };
  await admin.mutation(api.demo.switchProfile, args);
  const first = (await admin.query(api.me.get, {}))!;
  await admin.mutation(api.demo.switchProfile, args);
  expect((await admin.query(api.me.get, {}))!.member._id).toBe(first.member._id);
  await admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: first.member._id });
  const second = (await admin.query(api.me.get, {}))!;
  expect(second.member._id).not.toBe(first.member._id);
  await admin.mutation(api.demo.switchProfile, { mode: 'return', expectedMemberId: second.member._id });
  expect((await admin.query(api.me.get, {}))!.member._id).toBe(members.admin);
  expect(await t.run(ctx => ctx.db.query('demoProfiles').collect())).toHaveLength(1);
});

test('requires opted-in deployment and admin; cannot select someone else’s profile', async () => {
  const { t, admin, members } = await setup();
  for (const subject of ['sample:partner', 'sample:twin1', 'outsider']) {
    const caller = t.withIdentity({ subject });
    expect(await caller.query(api.demo.profile, {})).toBeNull();
    await expect(caller.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.admin })).rejects.toThrow();
  }
  await expect(t.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.admin })).rejects.toThrow();
  await admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.partner });
  expect((await admin.query(api.me.get, {}))!.member._id).toBe(members.admin);
  vi.stubEnv('DEMO_MODE', 'false');
  expect(await admin.query(api.demo.profile, {})).toBeNull();
  await expect(admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.admin })).rejects.toThrow();
});

test('return works even if demo mode gets disabled; never takes an occupied original profile', async () => {
  const { t, admin, members } = await setup();
  await admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.admin });
  const fresh = (await admin.query(api.me.get, {}))!;
  await t.run(ctx => ctx.db.patch(members.admin, { authId: 'someone-else' }));
  await expect(admin.mutation(api.demo.switchProfile, { mode: 'return', expectedMemberId: fresh.member._id })).rejects.toThrow();
  expect((await admin.query(api.me.get, {}))!.member._id).toBe(fresh.member._id);
  await t.run(ctx => ctx.db.patch(members.admin, { authId: undefined }));
  vi.stubEnv('DEMO_MODE', 'false');
  expect(await admin.query(api.demo.profile, {})).toMatchObject({ active: true });
  await admin.mutation(api.demo.switchProfile, { mode: 'return', expectedMemberId: fresh.member._id });
  expect((await admin.query(api.me.get, {}))!.member._id).toBe(members.admin);
});

test('a switched profile cannot reuse the previous chat’s cursor or read its messages', async () => {
  const { admin, members } = await setup();
  const first = await admin.query(api.chat.thread, { profileKey: members.admin, paginationOpts: { numItems: 1, cursor: null } });
  expect(first.isDone).toBe(false);
  await admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.admin });
  const fresh = (await admin.query(api.me.get, {}))!;
  const oldSubscription = await admin.query(api.chat.thread, { profileKey: members.admin, paginationOpts: { numItems: 1, cursor: first.continueCursor } });
  expect(oldSubscription).toEqual({ page: [], isDone: true, continueCursor: '' });
  const next = await admin.query(api.chat.thread, { profileKey: fresh.member._id, paginationOpts: { numItems: 30, cursor: null } });
  expect(next.page).toHaveLength(2);
  expect(next.page.every(message => message.familyId === fresh.family._id)).toBe(true);
});

test('fresh demo uses actual chat.send for a conversational introduction and continues through setup', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const { t, admin, members } = await setup();
  await admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: members.admin });
  __setChatModelForTests(makeFakeChatModel(() => jsonReply({ name: 'Brandon', reply: 'Nice to meet you.' })));
  const sent = await admin.mutation(api.chat.send, { text: 'Hi Teal, my name is Brandon and I want to create a MEGA for my mother.', via: 'text' });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await admin.query(api.me.get, {}))!.member.name).toBe('Brandon');
  expect(await admin.query(api.chat.streamBody, { streamId: sent.streamId })).toMatchObject({ status: 'done' });
  for (const offer of ['gmail', 'calendar', 'ics'] as const) await admin.mutation(api.onboarding.skip, { offer });
  expect(await admin.query(api.onboarding.state, {})).toMatchObject({ step: 'done' });
  const draft = await admin.mutation(internal.megaCreation.execute, { name: 'mega_draft_get', argumentsJson: '{}' });
  expect(JSON.parse(draft).draftId).toBeUndefined();
  await admin.mutation(api.megaCreation.personalize, {});
  expect(await admin.query(api.megaCreation.current, {})).toMatchObject({ data: { target: 'self', name: 'Brandon' } });
});

async function freshInvite() {
  const s = await setup();
  await s.admin.mutation(api.demo.switchProfile, { mode: 'fresh', expectedMemberId: s.members.admin });
  const fresh = (await s.admin.query(api.me.get, {}))!;
  await s.admin.mutation(api.onboarding.setName, { name: 'Brandon' });
  const call = async (name: string, args: object) => JSON.parse(await s.admin.mutation(internal.megaCreation.execute, { name, argumentsJson: JSON.stringify(args) }));
  const draft = await call('mega_draft_update', { target: 'new', name: 'Lovie', role: 'adult', relationship: 'parent', brief: { context: 'A busy mother writing a children’s book.' } });
  const review = await call('mega_draft_review', { draftId: draft.draftId });
  const { memberId } = await call('mega_draft_confirm', { draftId: draft.draftId, revision: review.revision, confirmed: true });
  const invite = await s.admin.mutation(api.invites.create, { memberId });
  return { ...s, fresh, memberId, invite };
}

test('single-device test goes through real redemption, keeps brief pending, and returns without losing either chat', async () => {
  const s = await freshInvite();
  await s.admin.mutation(api.demo.testInvite, { token: s.invite.url, expectedMemberId: s.fresh.member._id });
  expect(await s.admin.query(api.me.get, {})).toBeNull();
  await expect(s.admin.mutation(api.onboarding.begin, { timezone: 'America/New_York' })).rejects.toThrow();
  expect(await s.admin.query(api.demo.profile, {})).toMatchObject({ active: true, testing: true, pendingToken: expect.any(String) });
  const preview = await s.admin.query(api.invites.preview, { token: s.invite.url });
  expect(preview).toMatchObject({ status: 'ok', memberName: 'Lovie', family: expect.arrayContaining([expect.objectContaining({ name: 'Brandon' })]) });
  await s.admin.action(api.invites.redeem, { token: s.invite.url });
  expect((await s.admin.query(api.me.get, {}))!.member._id).toBe(s.memberId);
  await s.admin.mutation(api.chat.start, {});
  const brief = await s.t.run(ctx => ctx.db.query('assistantBriefs').withIndex('by_family_member', q => q.eq('familyId', s.fresh.family._id).eq('memberId', s.memberId)).unique());
  expect(brief?.status).toBe('pending');
  await s.admin.mutation(api.demo.switchTester, { expectedMemberId: s.memberId });
  expect((await s.admin.query(api.me.get, {}))!.member._id).toBe(s.fresh.member._id);
  expect(await s.admin.query(api.invites.forMember, { memberId: s.memberId })).toMatchObject({ status: 'joined' });
  await expect(s.admin.mutation(api.invites.create, { memberId: s.memberId })).rejects.toThrow();
  await s.admin.mutation(api.demo.switchTester, { memberId: s.memberId, expectedMemberId: s.fresh.member._id });
  const thread = await s.admin.query(api.chat.thread, { profileKey: s.memberId, paginationOpts: { numItems: 30, cursor: null } });
  expect(thread.page.some(m => m.body.type === 'block')).toBe(true);
  await s.admin.mutation(api.demo.switchTester, { expectedMemberId: s.memberId });
  await s.admin.mutation(api.demo.switchProfile, { mode: 'return', expectedMemberId: s.fresh.member._id });
  expect((await s.admin.query(api.me.get, {}))!.member._id).toBe(s.members.admin);
});

test('sandbox cannot claim another family, revisit arbitrary people, or strand the tester when cancelled', async () => {
  const s = await freshInvite();
  await expect(s.admin.mutation(api.demo.switchTester, { memberId: s.members.partner, expectedMemberId: s.fresh.member._id })).rejects.toThrow();
  await s.admin.mutation(api.demo.testInvite, { token: s.invite.url, expectedMemberId: s.fresh.member._id });
  const outsider = s.t.withIdentity({ subject: 'outsider' });
  await expect(outsider.mutation(api.demo.switchTester, { memberId: s.memberId, expectedMemberId: null })).rejects.toThrow();
  vi.stubEnv('DEMO_MODE', 'false');
  await s.admin.mutation(api.demo.switchTester, { expectedMemberId: null });
  expect((await s.admin.query(api.me.get, {}))!.member._id).toBe(s.fresh.member._id);
  expect((await s.admin.query(api.invites.preview, { token: s.invite.url })).status).toBe('ok');
});
