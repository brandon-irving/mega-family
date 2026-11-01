/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { register as registerStreaming } from '@convex-dev/persistent-text-streaming/test';
import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { SCHEDULING } from '../shared/config/scheduling';
import type { EmailPlan } from '../shared/domain/scheduling';
import { zonedInstant } from '../shared/time';
import { validatePlans } from './model/schedulingExtract';
import { encryptToken } from './model/tokenVault';
import { makeFakeGoogleOAuth, makeFakeCalendarSource, makeFakeMailSource } from './adapters/fakeGoogle';
import { __setGoogleOAuthForTests, __setCalendarSourceForTests, __setMailSchedulingForTests, __setMailSourceForTests, __setChatModelForTests } from './adapters/registry';
import { makeFakeChatModel, jsonReply } from './adapters/fakeChatModel';
const modules = import.meta.glob('./**/*.ts');
const tz = 'America/New_York';
const at = (h: number, m = 0) => zonedInstant('2026-10-27', h * 60 + m, tz);
const slot = (h: number, m = 0) => ({ start: at(h, m), end: at(h + 1, m) });
const sample = (intent: EmailPlan['intent'], slots = [slot(12)], participantNames: string[] = []): EmailPlan => ({ title: intent === 'confirmed' ? 'Private business meeting' : 'Lunch', intent, slots, participantNames, missing: [], durationAssumed: false });
let holdCalls = 0, draftCalls = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  process.env.INTEGRATION_TOKEN_KEY = btoa('s'.repeat(32));
  holdCalls = 0; draftCalls = 0;
  __setGoogleOAuthForTests(makeFakeGoogleOAuth());
  __setCalendarSourceForTests(makeFakeCalendarSource([]));
  __setMailSchedulingForTests({ watch: async () => null, hold: async p => { holdCalls++; __setCalendarSourceForTests(makeFakeCalendarSource([{ externalId: p.id, title: p.title, ...p.slot, cancelled: p.cancelled ?? false }])); return { ok: true, id: p.id }; }, draft: async () => { draftCalls++; return { ok: true, id: 'draft-one' }; } });
  __setMailSourceForTests(makeFakeMailSource([{ id: 'lunch-1', threadId: 'lunch-thread', internalDate: 100, fromName: 'Library', fromAddress: 'events@example.org', subject: 'Lunch', text: 'Lunch?' }]));
  __setChatModelForTests(makeFakeChatModel(() => jsonReply({ items: [] })));
});
afterEach(() => { delete process.env.INTEGRATION_TOKEN_KEY; __setGoogleOAuthForTests(null); __setCalendarSourceForTests(null); __setMailSchedulingForTests(null); __setMailSourceForTests(null); __setChatModelForTests(null); vi.useRealTimers(); });
async function setup() {
  const t = convexTest(schema, modules); registerStreaming(t);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const admin = t.withIdentity({ subject: 'sample:admin' }), partner = t.withIdentity({ subject: 'sample:partner' });
  const integrations = await t.run(async ctx => {
    for (const i of await ctx.db.query('integrations').collect()) await ctx.db.patch(i._id, { status: 'disconnected' });
    const create = (memberId: Id<'members'>) => ctx.db.insert('integrations', { familyId, memberId, kind: 'gmail', status: 'connected', label: `${memberId}@example.org`, config: {} });
    return { admin: await create(members.admin), partner: await create(members.partner) };
  });
  for (const caller of [admin, partner]) await caller.mutation(api.scheduling.setPreferences, { enabled: true, autoCapture: true, availabilityFor: [] });
  const ingest = (who: 'admin' | 'partner', plan: EmailPlan, messageId = who === 'admin' ? 'meeting-1' : 'lunch-1', received = 100) => t.mutation(internal.scheduling.ingest, { integrationId: integrations[who], messageId, threadId: who === 'admin' ? 'meeting-thread' : 'lunch-thread', at: received, label: 'From email', plans: [plan] });
  const planId = async (who: 'admin' | 'partner') => (await t.run(ctx => ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', familyId).eq('ownerId', members[who])).first()))!._id;
  const share = () => admin.mutation(api.scheduling.setPreferences, { enabled: true, autoCapture: true, availabilityFor: [members.partner] });
  const view = async () => partner.query(api.scheduling.get, { planId: await planId('partner') });
  const finish = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, admin, partner, members, familyId, integrations, ingest, planId, share, view, finish };
}

test('confirmed email blocks noon, lunch offers shared alternatives without leaking the meeting', async () => {
  const s = await setup(); await s.share();
  await s.ingest('admin', sample('confirmed'));
  await s.ingest('partner', sample('proposed', [slot(12), slot(13, 30)], ['Admin']));
  const view = await s.view();
  expect(view.slots.find(x => x.start === at(12))?.available).toBe(false);
  expect(view.slots.find(x => x.start === at(13, 30))?.available).toBe(true);
  expect(view.guidance).toContain('Admin is busy');
  expect(view.guidance).toContain('1:30');
  expect(JSON.stringify(view)).not.toContain('Private business meeting');
  expect(JSON.stringify(view)).not.toContain('meeting-1');
  await s.finish();
});
test('a later-arriving commitment invalidates a previously free lunch slot', async () => {
  const s = await setup(); await s.share();
  await s.ingest('partner', sample('proposed', [slot(12)], ['Admin']));
  expect((await s.view()).slots[0].available).toBe(true);
  await s.ingest('admin', sample('confirmed'));
  expect((await s.view()).slots[0].available).toBe(false);
  expect((await s.view()).slots.some(x => x.alternative && x.available)).toBe(true);
  await s.finish();
});
test('permission is explicit, revocable, and unrelated private events never appear in the view', async () => {
  const s = await setup();
  await s.ingest('partner', sample('proposed', [slot(12)], ['Admin']));
  expect((await s.view()).slots.every(x => !x.checked)).toBe(true);
  await s.share(); expect((await s.view()).slots[0].checked).toBe(true);
  await s.admin.mutation(api.scheduling.setPreferences, { enabled: true, autoCapture: true, availabilityFor: [] });
  expect((await s.view()).slots[0].checked).toBe(false);
  expect((await s.view()).guidance).toContain('still need to check');
  expect((await s.view()).guidance).not.toContain('is busy');
  await expect(s.admin.query(api.scheduling.get, { planId: await s.planId('partner') })).rejects.toThrow();
  await s.finish();
});
test('duplicate and out-of-order emails do not duplicate or revert events', async () => {
  const s = await setup(); await s.ingest('admin', sample('confirmed'));
  const id = await s.planId('admin');
  const original = await s.t.run(ctx => ctx.db.get(id));
  await s.ingest('admin', sample('confirmed'));
  expect((await s.t.run(ctx => ctx.db.get(id)))?.revision).toBe(1);
  await s.ingest('admin', { ...sample('confirmed', [slot(15)]), title: 'Private business meeting' }, 'meeting-2', 200);
  await s.ingest('admin', sample('confirmed'), 'old-mail', 50);
  const revised = await s.t.run(ctx => ctx.db.get(id));
  expect(revised?.eventId).toBe(original?.eventId);
  expect((await s.t.run(ctx => ctx.db.get(revised!.eventId!)))?.start).toBe(at(15));
  await s.ingest('admin', sample('cancelled', []), 'meeting-3', 300);
  expect((await s.t.run(ctx => ctx.db.get(revised!.eventId!)))?.cancelled).toBe(true);
  await s.finish();
});
test('tentative, incomplete, disabled and assumed-duration email plans are never auto-added', async () => {
  const s = await setup();
  await s.ingest('partner', sample('proposed'));
  const p = await s.t.run(ctx => ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', s.familyId).eq('ownerId', s.members.partner)).first());
  expect(p?.eventId).toBeUndefined();
  await s.ingest('admin', { ...sample('confirmed'), durationAssumed: true });
  const adminPlan = await s.planId('admin');
  expect((await s.t.run(ctx => ctx.db.get(adminPlan)))?.eventId).toBeUndefined();
  await s.finish();
});
test('stale calendar means unknown availability, never a free slot', async () => {
  const s = await setup(); await s.share();
  await s.ingest('partner', sample('proposed', [slot(12)], ['Admin']));
  await s.t.run(ctx => ctx.db.insert('integrations', { familyId: s.familyId, memberId: s.members.admin, kind: 'googleCalendar', config: {}, status: 'needs_reconnect', lastSyncAt: 1 }));
  expect((await s.view()).slots[0]).toMatchObject({ checked: false, available: false });
  await s.finish();
});
test('push persists one coalesced wakeup and unsigned webhooks fail closed', async () => {
  const s = await setup();
  await s.t.mutation(internal.gmailPush.receive, { email: `${s.members.admin}@example.org` });
  await s.t.mutation(internal.gmailPush.receive, { email: `${s.members.admin}@example.org` });
  expect(await s.t.run(ctx => ctx.db.get(s.integrations.admin))).toMatchObject({ mailWakeQueued: true, mailWakeVersion: 2 });
  expect((await s.t.fetch('/google/gmail/push', { method: 'POST', body: '{}' })).status).toBe(401);
  await s.finish();
});
test('hold and draft are idempotent, owned by the caller, and never book another participant', async () => {
  const s = await setup(); await s.share();
  await s.ingest('partner', sample('proposed', [slot(13, 30)], ['Admin']));
  await s.t.run(async ctx => {
    await ctx.db.insert('integrationSecrets', { familyId: s.familyId, memberId: s.members.partner, provider: 'google', refreshToken: await encryptToken('test'), accessToken: await encryptToken('test'), accessTokenExpiresAt: Date.now() + 3_600_000, grantedAt: Date.now(), scopes: Object.values(SCHEDULING.scopes) });
    await ctx.db.insert('integrations', { familyId: s.familyId, memberId: s.members.partner, kind: 'googleCalendar', config: {}, status: 'connected' });
  });
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13, 30) });
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13, 30) });
  expect(holdCalls).toBe(1);
  const plan = await s.t.run(ctx => ctx.db.get(planId));
  expect(plan?.status).toBe('held');
  expect((await s.t.run(ctx => ctx.db.get(plan!.eventId!)))?.who).toEqual([s.members.partner]);
  await s.partner.action(api.scheduling.draft, { planId, revision: 1 });
  await s.partner.action(api.scheduling.draft, { planId, revision: 1 });
  expect(draftCalls).toBe(1);
  await expect(s.admin.action(api.scheduling.draft, { planId, revision: 1 })).rejects.toThrow();
  await s.finish();
});
test('invalid dates and unclear confirmations stay in review', () => {
  const now = at(9);
  const make = (start: string, end: string, extra = {}) => [{ title: 'Meeting', intent: 'confirmed', slots: [{ start, end }], participantNames: [], missing: [], durationAssumed: false, ...extra }];
  expect(validatePlans(make('2026-02-30T12:00', '2026-02-30T13:00'), tz, now)[0].intent).toBe('review');
  expect(validatePlans(make('2026-10-27T12:00', '2026-10-27T13:00', { durationAssumed: true }), tz, now)[0].intent).toBe('review');
  expect(validatePlans(make('2026-10-27T12:00', '2026-10-27T13:00'), tz, now)[0].slots).toEqual([slot(12)]);
});

test('repeated delivery after a dismissal never recreates an undone event', async () => {
  const s = await setup(); await s.ingest('admin', sample('confirmed'));
  const planId = await s.planId('admin');
  const eventId = (await s.t.run(ctx => ctx.db.get(planId)))!.eventId!;
  await s.admin.mutation(api.scheduling.dismiss, { planId });
  await s.ingest('admin', sample('confirmed'));
  expect(await s.t.run(ctx => ctx.db.get(eventId))).toBeNull();
  expect((await s.t.run(ctx => ctx.db.get(planId)))?.status).toBe('dismissed');
  await s.finish();
});
test('calendar imports with the same title and timing are linked, not copied or removed by Undo', async () => {
  const s = await setup();
  const existing = await s.t.run(ctx => ctx.db.insert('events', { familyId: s.familyId, title: 'Private business meeting', ...slot(12), who: [s.members.admin], ownerId: s.members.admin, source: 'google', scope: 'personal', cancelled: false }));
  await s.ingest('admin', sample('confirmed'));
  const planId = await s.planId('admin');
  expect((await s.admin.query(api.scheduling.get, { planId })).canUndo).toBe(false);
  expect((await s.t.run(ctx => ctx.db.get(planId)))?.eventId).toBe(existing);
  await s.admin.mutation(api.scheduling.dismiss, { planId });
  expect(await s.t.run(ctx => ctx.db.get(existing))).not.toBeNull();
  await s.finish();
});
test('kid, cross-family and unrecognized participant permissions fail closed', async () => {
  const s = await setup();
  await expect(s.admin.mutation(api.scheduling.setPreferences, { enabled: true, autoCapture: true, availabilityFor: [s.members.twin1] })).rejects.toThrow();
  await expect(s.t.withIdentity({ subject: 'sample:twin1' }).query(api.scheduling.preferences, {})).rejects.toThrow();
  await s.ingest('partner', sample('proposed', [slot(12)], ['Unknown person']));
  const view = await s.view();
  expect(view.missing.length).toBeGreaterThan(0);
  expect(view.slots.every(x => !x.available)).toBe(true);
  await s.finish();
});
test('in-flight calendar reservations prevent a competing plan from claiming the same slot', async () => {
  const s = await setup();
  await s.ingest('partner', sample('proposed', [slot(13)]));
  const planId = await s.planId('partner');
  await s.t.run(async ctx => {
    const p = (await ctx.db.get(planId))!;
    const { _id, _creationTime, ...fields } = p;
    void _id; void _creationTime;
    await ctx.db.insert('mailPlans', { ...fields, threadId: 'another-thread', selected: slot(13), calendarOperation: 'running' });
  });
  expect((await s.view()).slots[0].available).toBe(false);
  await s.finish();
});
test('new scheduling extraction passes through the normal Gmail sync and keeps suggestions out of legacy events', async () => {
  const s = await setup(); await s.share();
  await s.t.run(async ctx => {
    await ctx.db.insert('integrationSecrets', { familyId: s.familyId, memberId: s.members.partner, provider: 'google', refreshToken: await encryptToken('test'), accessToken: await encryptToken('test'), accessTokenExpiresAt: Date.now() + 3_600_000, grantedAt: Date.now(), scopes: [] });
  });
  __setChatModelForTests(makeFakeChatModel(req => {
    expect(req.messages[0].content).toContain('Invitations and suggested alternatives are proposed');
    return jsonReply({ items: [{ kind: 'event', title: 'Should not be a commitment', date: '2026-10-27', time: '12:00', forFamily: false }], plans: [{ title: 'Lunch', intent: 'proposed', slots: [{ start: '2026-10-27T12:00', end: '2026-10-27T13:00' }, { start: '2026-10-27T13:30', end: '2026-10-27T14:30' }], participantNames: ['Admin'], missing: [], durationAssumed: false }] });
  }));
  await s.t.action(internal.integrations.syncGmail, { integrationId: s.integrations.partner, firstLook: true });
  const view = await s.view();
  expect(view.status).toBe('proposed');
  expect(view.slots).toHaveLength(2);
  expect(view.eventId).toBeUndefined();
  const legacy = await s.t.run(ctx => ctx.db.query('mailItems').withIndex('by_integration_message', q => q.eq('integrationId', s.integrations.partner).eq('gmailMessageId', 'lunch-1')).collect());
  expect(legacy).toHaveLength(0);
  await s.finish();
});

async function enableWrites(s: Awaited<ReturnType<typeof setup>>) {
  await s.t.run(async ctx => {
    await ctx.db.insert('integrationSecrets', { familyId: s.familyId, memberId: s.members.partner, provider: 'google', refreshToken: await encryptToken('test'), accessToken: await encryptToken('test'), accessTokenExpiresAt: Date.now() + 3_600_000, grantedAt: Date.now(), scopes: Object.values(SCHEDULING.scopes) });
    await ctx.db.insert('integrations', { familyId: s.familyId, memberId: s.members.partner, kind: 'googleCalendar', config: {}, status: 'connected' });
  });
}
test('confirmed and cancelled replies reconcile the approved hold without duplicating it', async () => {
  const s = await setup(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)]));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  const original = (await s.t.run(ctx => ctx.db.get(planId)))!;
  await s.ingest('partner', sample('confirmed', [slot(13)]), 'confirmation', 200);
  await s.finish();
  expect((await s.t.run(ctx => ctx.db.get(planId)))!).toMatchObject({ status: 'confirmed', calendarExternalId: original.calendarExternalId, calendarOperation: 'done' });
  expect(holdCalls).toBe(2);
  await s.ingest('partner', sample('cancelled', []), 'cancellation', 300);
  await s.finish();
  expect((await s.t.run(ctx => ctx.db.get(planId)))!).toMatchObject({ status: 'cancelled', calendarOperation: 'done' });
  expect(holdCalls).toBe(3);
});
test('a confirmed move to a different time requires review before changing Google Calendar', async () => {
  const s = await setup(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)]));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  await s.ingest('partner', sample('confirmed', [slot(15)]), 'new-time', 200);
  await s.finish();
  expect(holdCalls).toBe(1);
  expect((await s.t.run(ctx => ctx.db.get(planId)))?.calendarOperation).toBe('uncertain');
  await s.partner.action(api.scheduling.syncCalendar, { planId, revision: 2 });
  expect(holdCalls).toBe(2);
  await s.finish();
});
test('an interrupted draft becomes uncertain and cannot be blindly replayed', async () => {
  const s = await setup(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)]));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  await s.partner.mutation(internal.scheduling.claim, { planId, revision: 1, operation: 'draft' });
  await s.finish();
  expect((await s.t.run(ctx => ctx.db.get(planId)))?.draftOperation).toBe('uncertain');
  await expect(s.partner.action(api.scheduling.draft, { planId, revision: 1 })).rejects.toThrow();
  expect(draftCalls).toBe(0);
});
test('truncated calendar sync never reports a free time', async () => {
  const s = await setup(); await enableWrites(s);
  __setCalendarSourceForTests(makeFakeCalendarSource(Array.from({ length: 501 }, (_, i) => ({ externalId: `event-${i}`, title: 'Busy', ...slot(16), cancelled: false }))));
  await s.ingest('partner', sample('proposed', [slot(13)]));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.refresh, { planId });
  expect((await s.view()).slots.every(x => !x.checked && !x.available)).toBe(true);
  await s.finish();
});

test('a later Calendar import replaces the equivalent email copy without duplicating the commitment', async () => {
  const s = await setup();
  await s.ingest('admin', sample('confirmed'));
  const planId = await s.planId('admin');
  const original = (await s.t.run(ctx => ctx.db.get(planId)))!.eventId!;
  const integrationId = await s.t.run(ctx => ctx.db.insert('integrations', { familyId: s.familyId, memberId: s.members.admin, kind: 'googleCalendar', config: {}, status: 'connected' }));
  await s.t.mutation(internal.integrations.applyEvents, { integrationId, events: [{ externalId: 'calendar-meeting', title: 'Private business meeting', ...slot(12), cancelled: false }] });
  const updated = (await s.t.run(ctx => ctx.db.get(planId)))!;
  expect(updated.eventId).not.toBe(original);
  expect(updated.ownsEvent).toBe(false);
  expect(await s.t.run(ctx => ctx.db.get(original))).toBeNull();
  await s.finish();
});

test('email updates dedupe pushes and reuse the existing card; disabling recognition cancels pending delivery', async () => {
  const s = await setup();
  await s.ingest('admin', sample('confirmed'));
  await s.ingest('admin', sample('confirmed'));
  const id = await s.planId('admin');
  const candidates = await s.t.run(ctx => ctx.db.query('candidates').collect());
  const matches = candidates.filter(c => c.source?.kind === 'mailPlan' && c.source.planId === id);
  expect(matches).toHaveLength(1);
  const messages = await s.t.run(ctx => ctx.db.query('messages').collect());
  expect(messages.filter(m => m.body.type === 'card' && m.body.card.kind === 'mailPlan' && m.body.card.planId === id)).toHaveLength(1);
  const { candidateStillApplies } = await import('./model/proactive');
  await s.admin.mutation(api.scheduling.setPreferences, { enabled: false, autoCapture: false, availabilityFor: [] });
  expect(await s.t.run(ctx => candidateStillApplies(ctx, matches[0].source, s.members.admin))).toBe(false);
  await s.finish();
});
