import { exchangeAndStore } from './integrations';
/// <reference types="vite/client" />
import { register } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakeGoogleOAuth } from './adapters/fakeGoogle';
import { __setChatModelForTests, __setGoogleOAuthForTests } from './adapters/registry';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('INTEGRATION_TOKEN_KEY', btoa('k'.repeat(32)).replace(/=+$/, ''));
  __setGoogleOAuthForTests(makeFakeGoogleOAuth());
});
afterEach(() => {
  __setGoogleOAuthForTests(null);
  __setChatModelForTests(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function fresh() {
  const t = convexTest(schema, modules);
  register(t);
  const me = t.withIdentity({ subject: 'google-setup-owner' });
  const ids = await me.mutation(api.onboarding.begin, { timezone: 'America/New_York' });
  return { t, me, ...ids };
}

test('first introduction can save the name and offer Google setup in the same turn', async () => {
  const { t, me } = await fresh();
  __setChatModelForTests(makeFakeChatModel(req => {
    expect(req.messages[0].content).toContain('MEGA supports connecting Google');
    return jsonReply({ name: 'Brandon', reply: 'Yes, Brandon.', offerGoogle: true });
  }));
  const sent = await me.mutation(api.chat.send, { text: 'Brandon, can you connect to my google?', via: 'text' });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await me.query(api.me.get, {}))?.member.name).toBe('Brandon');
  expect(await me.query(api.chat.streamBody, { streamId: sent.streamId })).toMatchObject({ status: 'done', text: expect.stringContaining('connect Gmail and Google Calendar') });
  const messages = await t.run(ctx => ctx.db.query('messages').collect());
  expect(messages.filter(m => m.body.type === 'card' && m.body.card.kind === 'connect')).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query('integrations').collect())).toHaveLength(0);
});

test('ongoing chat tool offers one setup card without granting permissions or connecting accounts', async () => {
  const { t, me, familyId, threadId } = await fresh();
  await me.mutation(api.onboarding.setName, { name: 'Brandon' });
  const member = (await me.query(api.me.get, {}))!.member;
  const mega = await t.run(ctx => ctx.db.query('megas').first());
  const args = { familyId, memberId: member._id, megaId: mega!._id, threadId, name: 'google_setup', argumentsJson: '{}' };
  for (let i = 0; i < 2; i++) {
    expect(await t.mutation(internal.agent.tools.execute, args)).toMatchObject({ ok: true, resultText: expect.stringContaining('Google setup is available') });
  }
  const messages = await t.run(ctx => ctx.db.query('messages').collect());
  expect(messages.filter(m => m.body.type === 'card' && m.body.card.kind === 'connect')).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query('integrations').collect())).toHaveLength(0);
  expect(await t.mutation(internal.agent.tools.execute, { ...args, argumentsJson: '{"memberId":"someone-else"}' })).toMatchObject({ ok: false });
});

test('first introduction separates the owner name from an explicitly named assistant', async () => {
  const { t, me } = await fresh();
  __setChatModelForTests(makeFakeChatModel(() => jsonReply({ name: 'Brandon', megaName: 'Mega', reply: 'Hi Brandon, I’m Mega.', offerGoogle: false })));
  await me.mutation(api.chat.send, { text: 'Im Brandon and youre Mega', via: 'text' });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const viewer = await me.query(api.me.get, {});
  expect(viewer?.member.name).toBe('Brandon');
  expect(viewer?.mega?.name).toBe('Mega');
});


test('connected owner context is authoritative and setup does not repeat consent or post a card', async () => {
  const { t, me, familyId, threadId } = await fresh();
  const member = (await me.query(api.me.get, {}))!.member;
  await t.run(async ctx => {
    for (const kind of ['gmail', 'googleCalendar'] as const) await ctx.db.insert('integrations', { familyId, memberId: member._id, kind, status: 'connected', config: { privateMarker: 'never expose config' }, lastSyncAt: Date.now() });
  });
  const context = await t.query(internal.agent.context.buildContext, { familyId, memberId: member._id, threadId, userText: 'Check my email' });
  expect(JSON.parse(context.connectionContext)).toMatchObject({ allowed: true, recognitionEnabled: false, products: [{ kind: 'gmail', status: 'connected' }, { kind: 'googleCalendar', status: 'connected' }] });
  expect(context.connectionContext).not.toContain('privateMarker');
  const args = { familyId, memberId: member._id, threadId, name: 'google_setup', argumentsJson: '{}' };
  expect(await t.mutation(internal.agent.tools.execute, args)).toMatchObject({ ok: true, resultText: expect.stringContaining('already connected') });
  expect((await t.run(ctx => ctx.db.query('messages').collect())).filter(m => m.body.type === 'card' && m.body.card.kind === 'connect')).toHaveLength(0);
  expect(await t.mutation(internal.agent.tools.execute, { ...args, name: 'google_check' })).toMatchObject({ ok: true, resultText: expect.stringContaining('last minute') });
  expect(await t.run(ctx => ctx.db.query('schedulingPreferences').collect())).toHaveLength(0);
});

test('inbox checks queue existing syncs, refuse other threads/identifiers, and respect reconnect state', async () => {
  const { t, me, familyId, threadId } = await fresh();
  const member = (await me.query(api.me.get, {}))!.member;
  const id = await t.run(ctx => ctx.db.insert('integrations', { familyId, memberId: member._id, kind: 'gmail', status: 'connected', config: {} }));
  const args = { familyId, memberId: member._id, threadId, name: 'google_check', argumentsJson: '{}' };
  expect(await t.mutation(internal.agent.tools.execute, args)).toMatchObject({ ok: true, resultText: expect.stringContaining('Requested an Inbox/calendar check') });
  expect(await t.mutation(internal.agent.tools.execute, { ...args, argumentsJson: '{"memberId":"other"}' })).toMatchObject({ ok: false });
  await t.run(ctx => ctx.db.patch(id, { status: 'needs_reconnect' }));
  expect(await t.mutation(internal.agent.tools.execute, args)).toMatchObject({ ok: true, resultText: expect.stringContaining('needs reconnection') });
  const otherUser = t.withIdentity({ subject: 'another-google-owner' });
  await otherUser.mutation(api.onboarding.begin, { timezone: 'America/New_York' });
  const other = (await otherUser.query(api.me.get, {}))!.member;
  await t.run(ctx => ctx.db.patch(threadId, { ownerId: other._id }));
  expect(await t.mutation(internal.agent.tools.execute, args)).toMatchObject({ ok: false });
});

test.each(['success', 'failure', 'timeout'] as const)('explicit check reports %s and completion is idempotent', async outcome => {
  const { t, me, familyId, threadId } = await fresh();
  const member = (await me.query(api.me.get, {}))!.member;
  const startedAt = Date.now();
  const integrationId = await t.run(ctx => ctx.db.insert('integrations', { familyId, memberId: member._id, kind: 'gmail', status: 'connected', config: {} }));
  await t.mutation(internal.agent.tools.execute, { familyId, memberId: member._id, threadId, name: 'google_check', argumentsJson: '{}' });
  const pending = (await t.run(ctx => ctx.db.query('messages').collect())).find(m => m.body.type === 'notice' && m.body.text.startsWith('Checking your Inbox'))!;
  if (outcome === 'success') await t.run(ctx => ctx.db.patch(integrationId, { lastSyncAt: startedAt + 1 }));
  if (outcome === 'failure') await t.run(ctx => ctx.db.patch(integrationId, { lastFailure: 'unauthorized', lastFailureAt: startedAt + 1, status: 'needs_reconnect' }));
  const args = { messageId: pending._id, memberId: member._id, startedAt, attempt: 90, sources: [{ id: integrationId, needsFresh: true }] };
  await t.mutation(internal.googleChecks.complete, args);
  const result = await t.run(ctx => ctx.db.get(pending._id));
  expect(result?.body).toMatchObject({ type: 'text', text: expect.stringContaining(outcome === 'success' ? 'no new items' : outcome === 'failure' ? 'couldn’t finish' : 'taking longer') });
  if (outcome !== 'success') expect(JSON.stringify(result?.body)).not.toContain('no new items');
  if (outcome === 'success') expect(JSON.stringify(result?.body)).not.toContain('calendar is up to date');
  await t.mutation(internal.googleChecks.complete, args);
  expect(await t.run(ctx => ctx.db.get(pending._id))).toEqual(result);
});


test('demo authorization rejects the wrong Google email before storing a grant', async () => {
  const { t, me, familyId } = await fresh();
  const member = (await me.query(api.me.get, {}))!.member;
  __setGoogleOAuthForTests({ ...makeFakeGoogleOAuth(), exchangeCode: async () => ({ ok: true, tokens: { accessToken: 'fake', refreshToken: 'fake', expiresInSeconds: 3600, scopes: [], email: 'wrong@example.com' } }) });
  const runMutation = vi.fn();
  await expect(exchangeAndStore({ runMutation } as never, { familyId, memberId: member._id, want: ['gmail'], code: 'fake', redirectUri: '', expectedEmail: 'synthetictestuser68@gmail.com' })).rejects.toThrow('Choose synthetictestuser68@gmail.com');
  expect(runMutation).not.toHaveBeenCalled();
  expect(await t.run(ctx => ctx.db.query('integrations').collect())).toHaveLength(0);
});
