/// <reference types="vite/client" />
import { register } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { rankConnections, type ConnectionDefinition } from '../shared/config/connections';
import { api, internal } from './_generated/api';
import { makeFakeGoogleOAuth } from './adapters/fakeGoogle';
import { __setGoogleOAuthForTests } from './adapters/registry';
import { recommendConnection, answerConnectionRecommendationText } from './model/connectionRecommendations';
import schema from './schema';
import { connectorAllowed } from './model/integrations';
const modules = import.meta.glob('./**/*.ts');
const input = { context: 'Help promote my book', ageGroup: 'adult', connected: [], available: ['google'] };
test('ranking matches capabilities and supports additional providers through configuration', () => {
  const catalog: ConnectionDefinition[] = [{ id: 'mail', label: 'Mail', setup: 'mail', ageGroups: ['adult'], capabilities: ['correspondence'] }, { id: 'schedule', label: 'Schedule', setup: 'schedule', ageGroups: ['adult'], capabilities: ['availability'] }];
  expect(rankConnections({ ...input, available: ['mail', 'schedule'] }, catalog).map(c => c.providerId)).toEqual(['mail']);
  expect(rankConnections({ ...input, context: 'Find a meeting time', available: ['mail', 'schedule'] }, catalog).map(c => c.providerId)).toEqual(['schedule']);
});
test('ranking excludes unavailable, declined, ineligible and already connected capabilities', () => {
  expect(rankConnections(input)[0].capabilities).toEqual(['correspondence']);
  for (const override of [{ available: [] }, { excluded: ['google'] }, { ageGroup: 'child' }, { connected: ['correspondence', 'availability'] as const }]) expect(rankConnections({ ...input, ...override })).toEqual([]);
  expect(rankConnections({ ...input, connected: ['correspondence'], context: 'Schedule a meeting' })[0].capabilities).toEqual(['availability']);
  expect(rankConnections({ ...input, context: 'Hello' })).toEqual([]);
  expect(rankConnections({ ...input, context: 'Hello', allowBaseline: true })).toHaveLength(1);
});
beforeEach(() => {
  vi.stubEnv('INTEGRATION_TOKEN_KEY', btoa('k'.repeat(32)).replace(/=+$/, ''));
  __setGoogleOAuthForTests(makeFakeGoogleOAuth());
});
afterEach(() => { __setGoogleOAuthForTests(null); vi.unstubAllEnvs(); });
async function fresh() {
  const t = convexTest(schema, modules); register(t);
  const me = t.withIdentity({ subject: 'recommendation-owner' });
  const ids = await me.mutation(api.onboarding.begin, { timezone: 'America/New_York' });
  await me.mutation(api.onboarding.setName, { name: 'Brandon' });
  const member = (await me.query(api.me.get, {}))!.member;
  return { t, me, member, ...ids };
}
test('admin gets one optional recommendation; typed decline prevents further offers', async () => {
  const { t, member, threadId } = await fresh();
  expect(await t.run(ctx => ctx.db.query('connectionSuggestions').collect())).toHaveLength(1);
  await t.run(ctx => answerConnectionRecommendationText(ctx, member, threadId, 'No thanks', Date.now() + 100));
  expect(await t.run(ctx => ctx.db.query('connectionSuggestions').first())).toMatchObject({ status: 'declined' });
  expect(await t.run(ctx => recommendConnection(ctx, member, 'promote my book', Date.now() + 200))).toBe(false);
  expect(await t.run(ctx => ctx.db.query('integrations').collect())).toEqual([]);
});
test('acceptance opens setup without connecting or granting access', async () => {
  const { t, me } = await fresh();
  const suggestion = (await t.run(ctx => ctx.db.query('connectionSuggestions').first()))!;
  for (let i = 0; i < 2; i++) await me.mutation(api.chat.answerBlock, { messageId: suggestion.messageId, via: 'block', answer: { optionIds: ['connect'] } });
  expect(await t.run(ctx => ctx.db.query('connectionSuggestions').first())).toMatchObject({ status: 'accepted' });
  expect(await t.run(ctx => ctx.db.query('integrations').collect())).toEqual([]);
  const messages = await t.run(ctx => ctx.db.query('messages').collect());
  expect(messages.filter(m => m.body.type === 'card' && m.body.card.kind === 'connect')).toHaveLength(1);
});

test('creator approval only permits a suggestion; recipient still approves their own setup', async () => {
  const { t, me, member } = await fresh();
  const call = async (name: string, args: object) => JSON.parse(await me.mutation(internal.megaCreation.execute, { name, argumentsJson: JSON.stringify(args) }));
  const draft = await call('mega_draft_update', { target: 'new', name: 'Lovie', ageGroup: 'adult', role: 'adult', relationship: 'parent', megaName: 'Coral', hex: 'coral', sticker: 'heart', personality: 'calm', brief: { goal: 'Promote my book' } });
  const review = await call('mega_draft_review', { draftId: draft.draftId });
  const created = await call('mega_draft_confirm', { draftId: draft.draftId, revision: review.revision, confirmed: true });
  const creator = (await t.run(ctx => ctx.db.query('connectionSuggestions').collect())).find(r => r.mode === 'creator')!;
  expect(creator).toMatchObject({ ownerId: member._id, subjectId: created.memberId, status: 'pending' });
  const person = (await t.run(ctx => ctx.db.get(creator.subjectId)))!;
  expect(await t.run(ctx => recommendConnection(ctx, person, 'Promote my book', Date.now() + 50))).toBe(true);
  await me.mutation(api.chat.answerBlock, { messageId: creator.messageId, via: 'block', answer: { optionIds: ['connect'] } });
  expect(await t.run(ctx => ctx.db.query('integrations').collect())).toEqual([]);
  expect(await t.run(ctx => recommendConnection(ctx, person, 'Promote my book', Date.now() + 100))).toBe(false);
  const own = (await t.run(ctx => ctx.db.query('connectionSuggestions').collect())).find(r => r.ownerId === person._id)!;
  expect(own).toMatchObject({ mode: 'own', status: 'pending' });
  await expect(t.run(ctx => recommendConnection(ctx, member, 'book', Date.now(), { subject: { ...person, familyId: 'different' as typeof person.familyId } }))).rejects.toThrow();
});

test('an explicit creator decline suppresses recipient offers, while pending teen offers never grant account access', async () => {
  const { t, me, member } = await fresh();
  const created = await me.mutation(api.family.add, { name: 'Anela', role: 'kid', ageGroup: 'teen', relationship: 'daughter', mega: { name: 'Roll', look: { hex: '#8E6CE0', sticker: 'star' }, personality: 'funny' } });
  const teen = (await t.run(ctx => ctx.db.get(created.memberId)))!;
  await t.run(ctx => recommendConnection(ctx, member, 'School schedule', Date.now(), { subject: teen }));
  expect(await t.run(ctx => recommendConnection(ctx, teen, 'School schedule', Date.now()))).toBe(true);
  expect(await t.run(ctx => connectorAllowed(ctx, teen))).toBe(false);
  const rows = await t.run(ctx => ctx.db.query('connectionSuggestions').collect());
  const creator = rows.find(r => r.mode === 'creator')!;
  await me.mutation(api.chat.answerBlock, { messageId: creator.messageId, via: 'block', answer: { optionIds: ['decline'] } });
  // Retire this test's already-visible recipient offer to isolate the explicit creator decline guard.
  await t.run(async ctx => { for (const row of rows.filter(r => r.ownerId === teen._id)) await ctx.db.delete(row._id); });
  expect(await t.run(ctx => recommendConnection(ctx, teen, 'School schedule', Date.now()))).toBe(false);
});
