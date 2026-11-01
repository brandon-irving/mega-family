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
