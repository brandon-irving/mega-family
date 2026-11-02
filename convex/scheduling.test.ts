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
import { readerTitle, schedulingMissingText, validatePlans } from './model/schedulingExtract';
import { requestsForPlan } from './model/schedulingRequests';
import { sharesAvailability } from './model/schedulingSharing';
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
let calendarWrites: { id: string; confirmed: boolean }[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  process.env.INTEGRATION_TOKEN_KEY = btoa('s'.repeat(32));
  holdCalls = 0; draftCalls = 0; calendarWrites = [];
  __setGoogleOAuthForTests(makeFakeGoogleOAuth());
  __setCalendarSourceForTests(makeFakeCalendarSource([]));
  __setMailSchedulingForTests({ send: async () => ({ ok: true, id: 'sent-one' }), watch: async () => null, hold: async p => { holdCalls++; calendarWrites.push({ id: p.id, confirmed: p.confirmed }); __setCalendarSourceForTests(makeFakeCalendarSource([{ externalId: p.id, title: p.title, ...p.slot, cancelled: p.cancelled ?? false }])); return { ok: true, id: p.id }; }, draft: async () => { draftCalls++; return { ok: true, id: 'draft-one' }; } });
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

async function enableWrites(s: Awaited<ReturnType<typeof setup>>, who: 'partner' | 'admin' = 'partner') {
  await s.t.run(async ctx => {
    await ctx.db.insert('integrationSecrets', { familyId: s.familyId, memberId: s.members[who], provider: 'google', refreshToken: await encryptToken('test'), accessToken: await encryptToken('test'), accessTokenExpiresAt: Date.now() + 3_600_000, grantedAt: Date.now(), scopes: Object.values(SCHEDULING.scopes) });
    await ctx.db.insert('integrations', { familyId: s.familyId, memberId: s.members[who], kind: 'googleCalendar', config: {}, status: 'connected' });
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

test('shared hold asks once, rejects other responders, and records acceptance in both chats', async () => {
  const s = await setup(); await s.share(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)], ['Admin']));
  const planId = await s.planId('partner');
  for (let i = 0; i < 2; i++) await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  const requests = await s.t.run(ctx => ctx.db.query('requests').collect());
  const linked = requests.filter(r => r.scheduling?.planId === planId);
  expect(linked).toHaveLength(1);
  await expect(s.partner.mutation(api.requests.respond, { requestId: linked[0]._id, accept: true })).rejects.toThrow();
  await s.admin.mutation(api.requests.respond, { requestId: linked[0]._id, accept: true });
  await s.admin.mutation(api.requests.respond, { requestId: linked[0]._id, accept: true });
  expect(await s.t.run(ctx => ctx.db.get(linked[0]._id))).toMatchObject({ status: 'accepted' });
  const messages = await s.t.run(ctx => ctx.db.query('messages').collect());
  expect(messages.filter(m => m.body.type === 'text' && m.body.text.includes('Admin confirmed the proposed time'))).toHaveLength(1);
  await s.finish();
});
test('dismissing a held plan cancels its provider event and closes the confirmation', async () => {
  const s = await setup(); await s.share(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)], ['Admin']));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  await s.partner.mutation(api.scheduling.dismiss, { planId });
  await s.finish();
  const p = (await s.t.run(ctx => ctx.db.get(planId)))!;
  expect(p).toMatchObject({ status: 'cancelled', calendarOperation: 'done' });
  const event = await s.t.run(ctx => ctx.db.get(p.eventId!));
  expect(event === null || event.cancelled).toBe(true);
  const requests = await s.t.run(ctx => ctx.db.query('requests').collect());
  expect(requests.find(r => r.scheduling?.planId === planId)?.status).toBe('done');
});

test('reviewed reply requires family approval, binds exact content and sends only once', async () => {
  const s = await setup(); await s.share(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)], ['Admin']));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  await expect(s.partner.action(api.scheduling.previewReply, { planId, revision: 1 })).rejects.toThrow();
  const request = (await s.t.run(ctx => ctx.db.query('requests').collect())).find(r => r.scheduling?.planId === planId)!;
  await s.admin.mutation(api.requests.respond, { requestId: request._id, accept: true });
  const preview = await s.partner.action(api.scheduling.previewReply, { planId, revision: 1 });
  expect(preview.to).toBe('events@example.org');
  await expect(s.partner.action(api.scheduling.sendReply, { planId, revision: 1, ...preview, to: 'other@example.org' })).rejects.toThrow();
  let sends = 0;
  __setMailSchedulingForTests({ watch: async () => null, hold: async () => ({ ok: true, id: 'held' }), draft: async () => ({ ok: true, id: 'draft' }), send: async () => { sends++; return { ok: true, id: 'sent' }; } });
  for (let i = 0; i < 2; i++) await s.partner.action(api.scheduling.sendReply, { planId, revision: 1, ...preview });
  expect(sends).toBe(1);
  expect(await s.t.run(ctx => ctx.db.get(planId))).toMatchObject({ replyOperation: 'done', replyMessageId: 'sent', status: 'held' });
  await s.finish();
});
test('uncertain send cannot be repeated automatically or by double tapping', async () => {
  const s = await setup(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)]));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  const preview = await s.partner.action(api.scheduling.previewReply, { planId, revision: 1 });
  __setMailSchedulingForTests({ watch: async () => null, hold: async () => ({ ok: true, id: 'held' }), draft: async () => ({ ok: true, id: 'draft' }), send: async () => ({ ok: false, uncertain: true }) });
  await s.partner.action(api.scheduling.sendReply, { planId, revision: 1, ...preview });
  await expect(s.partner.action(api.scheduling.sendReply, { planId, revision: 1, ...preview })).rejects.toThrow(/uncertain/i);
  await s.finish();
});

test('organizer confirmation closes the same demo plan, updates Google and tells both people', async () => {
  const s = await setup(); await s.share(); await enableWrites(s);
  await s.ingest('partner', sample('proposed', [slot(13)], ['Admin']));
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  const req = (await s.t.run(ctx => ctx.db.query('requests').collect())).find(r => r.scheduling?.planId === planId)!;
  await s.admin.mutation(api.requests.respond, { requestId: req._id, accept: true });
  const preview = await s.partner.action(api.scheduling.previewReply, { planId, revision: 1 });
  await s.partner.action(api.scheduling.sendReply, { planId, revision: 1, ...preview });
  await s.t.run(ctx => ctx.db.insert('demoRuns', { familyId: s.familyId, adminId: s.members.admin, ownerAuthId: 'sample:admin', key: 'run-test', date: '2026-10-27', active: true, createdAt: 1, jobs: [{ stage: 'confirmation', attempt: 1, status: 'sent', queuedAt: 1, sourceMessageId: 'organizer-confirmed', planId, planRevision: 1 }] }));
  const args = { integrationId: s.integrations.partner, messageId: 'organizer-confirmed', threadId: 'new-organizer-thread', at: 200, label: 'Organizer', plans: [{ ...sample('confirmed', [slot(13)], ['Admin']), title: 'Lunch' }] };
  await s.t.mutation(internal.scheduling.ingest, args);
  await s.t.mutation(internal.scheduling.ingest, args);
  await s.finish();
  expect(await s.t.run(ctx => ctx.db.get(planId))).toMatchObject({ status: 'confirmed', calendarOperation: 'done', selected: slot(13) });
  const plans = await s.t.run(ctx => ctx.db.query('mailPlans').collect());
  expect(plans).toHaveLength(1);
  const messages = await s.t.run(ctx => ctx.db.query('messages').collect());
  expect(messages.filter(m => m.body.type === 'text' && m.body.text.startsWith('The organizer confirmed'))).toHaveLength(1);
  expect(messages.some(m => m.body.type === 'text' && m.body.text.includes('need your Google Calendar connection'))).toBe(true);
});

test('request details replace the vague card and yield only to a real notification message', async () => {
  const s = await setup();
  const requestId = await s.t.run(ctx => ctx.db.insert('requests', {
    familyId: s.familyId, fromMemberId: s.members.partner, toMemberId: s.members.admin,
    text: 'Lovie chose 2 PM. Does that work for you?', status: 'open',
  }));
  expect(await s.admin.query(api.requests.get, { requestId })).toMatchObject({ mirrored: false, text: 'Lovie chose 2 PM. Does that work for you?' });
  expect(await s.partner.query(api.requests.get, { requestId })).toBeNull();
  await s.t.run(async ctx => {
    const mega = await ctx.db.query('megas').withIndex('by_family_owner', q => q.eq('familyId', s.familyId).eq('ownerId', s.members.admin)).unique();
    const notificationId = await ctx.db.insert('notifications', {
      familyId: s.familyId, recipientId: s.members.admin, kind: 'request', loudness: 'active',
      title: 'Confirm a time', body: 'Does 2 PM work?', megaId: mega!._id, buttons: [], sentAt: 1, requestId,
    });
    await ctx.db.patch(requestId, { notificationId });
  });
  expect((await s.admin.query(api.requests.get, { requestId }))?.mirrored).toBe(false);
  await s.t.run(async ctx => {
    const request = await ctx.db.get(requestId);
    const notification = await ctx.db.get(request!.notificationId!);
    const thread = await ctx.db.query('threads').filter(q => q.eq(q.field('ownerId'), s.members.admin)).first();
    const messageId = await ctx.db.insert('messages', {
      familyId: s.familyId, threadId: thread!._id, at: 1, author: { kind: 'mega', id: notification!.megaId },
      via: 'text', body: { type: 'card', card: { kind: 'notification', notificationId: notification!._id } }, chips: [],
    });
    await ctx.db.patch(notification!._id, { messageId });
  });
  expect((await s.admin.query(api.requests.get, { requestId }))?.mirrored).toBe(true);
});

test('scheduling uses the owners personality without inventing availability', async () => {
  const s = await setup(); await s.share();
  await s.t.run(async ctx => {
    const mega = await ctx.db.query('megas').withIndex('by_family_owner', q => q.eq('familyId', s.familyId).eq('ownerId', s.members.partner)).unique();
    await ctx.db.patch(mega!._id, { personality: 'cheerful' });
  });
  await s.ingest('admin', sample('confirmed'));
  await s.ingest('partner', sample('proposed', [slot(12), slot(14)], ['Admin']));
  expect((await s.view()).guidance).toContain('You’ve got an invitation to plan Lunch!');
  expect((await s.view()).guidance).toContain('timing clash');
  await s.admin.mutation(api.scheduling.setPreferences, { enabled: true, autoCapture: true, availabilityFor: [] });
  expect((await s.view()).guidance).not.toContain('timing clash');
  await s.finish();
});

test('an offered time confirms after every family acceptance and updates the same Google event once', async () => {
  const s = await setup(); await s.share(); await enableWrites(s);
  await s.ingest('partner', { ...sample('proposed', [slot(13), slot(15)], ['Admin']), selectionConfirms: true });
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  const held = await s.t.run(ctx => ctx.db.get(planId));
  expect(held?.status).toBe('held');
  const req = (await s.t.run(ctx => ctx.db.query('requests').collect())).find(r => r.scheduling?.planId === planId)!;
  await s.admin.mutation(api.requests.respond, { requestId: req._id, accept: true });
  await s.admin.mutation(api.requests.respond, { requestId: req._id, accept: true });
  await s.finish();
  const confirmed = await s.t.run(ctx => ctx.db.get(planId));
  expect(confirmed).toMatchObject({ status: 'confirmed', confirmedBySelection: true, calendarOperation: 'done', eventId: held?.eventId, calendarExternalId: held?.calendarExternalId, slots: [slot(13)] });
  expect(holdCalls).toBe(2); // initial hold, then update of the same provider ID
  expect(calendarWrites).toEqual([{ id: held!.calendarExternalId, confirmed: false }, { id: held!.calendarExternalId, confirmed: true }]);
  const view = await s.view();
  expect(view.canSendReply).toBe(true);
  expect(view.guidance).toContain('Everyone agreed!');
  expect(view.guidance).not.toContain('Your email confirms');
  expect(view.replyText).toContain('We’ve chosen');
  expect(view.replyText).not.toContain('Please confirm');
  const messages = await s.t.run(ctx => ctx.db.query('messages').collect());
  expect(messages.filter(m => m.body.type === 'text' && m.body.text.includes('is confirmed! I updated your calendar'))).toHaveLength(1);
});

test('a family decline leaves an offered time tentative', async () => {
  const s = await setup(); await s.share(); await enableWrites(s);
  await s.ingest('partner', { ...sample('proposed', [slot(13)], ['Admin']), selectionConfirms: true });
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
  const req = (await s.t.run(ctx => ctx.db.query('requests').collect())).find(r => r.scheduling?.planId === planId)!;
  await s.admin.mutation(api.requests.respond, { requestId: req._id, accept: false });
  await s.finish();
  expect((await s.view()).status).toBe('held');
  expect(holdCalls).toBe(1);
});

test('a generated alternative still requires the sender even if offered slots permit selection', async () => {
  const s = await setup(); await s.share(); await enableWrites(s);
  await s.ingest('admin', sample('confirmed'));
  await s.ingest('partner', { ...sample('proposed', [slot(12)], ['Admin']), selectionConfirms: true });
  const planId = await s.planId('partner');
  await s.partner.action(api.scheduling.refresh, { planId });
  const alternative = (await s.view()).slots.find(x => x.alternative)!;
  await s.partner.action(api.scheduling.hold, { planId, revision: 1, start: alternative.start, end: alternative.end });
  const req = (await s.t.run(ctx => ctx.db.query('requests').collect())).find(r => r.scheduling?.planId === planId)!;
  await s.admin.mutation(api.requests.respond, { requestId: req._id, accept: true });
  await s.finish();
  expect((await s.view()).status).toBe('held');
  expect(holdCalls).toBe(1);
});

test('estimated durations cannot authorize implicit confirmation during extraction', () => {
  const raw = { title: 'Call', intent: 'proposed', slots: [{ start: '2026-10-27T13:00', end: '2026-10-27T14:00' }], participantNames: [], missing: [], durationAssumed: true, selectionConfirms: true };
  expect(validatePlans([raw], tz, at(9))[0].selectionConfirms).toBe(false);
  expect(validatePlans([{ ...raw, durationAssumed: false }], tz, at(9))[0].selectionConfirms).toBe(true);
});

test('sharing-only changes persist without overwriting recognition, capture or write preferences', async () => {
 const s = await setup();
 await s.admin.mutation(api.scheduling.setPreferences, { enabled: true, autoCapture: true, desiredWrites: false, availabilityFor: [] });
 await s.admin.mutation(api.scheduling.setSharing, { availabilityFor: [s.members.partner] });
 expect(await s.admin.query(api.scheduling.preferences, {})).toMatchObject({ enabled: true, autoCapture: true, desiredWrites: false, availabilityFor: [s.members.partner] });
 await expect(s.admin.mutation(api.scheduling.setSharing, { availabilityFor: [s.members.admin] })).rejects.toThrow();
 await s.admin.mutation(api.scheduling.setSharing, { availabilityFor: [] });
 expect((await s.admin.query(api.scheduling.preferences, {})).availabilityFor).toEqual([]);
 await s.finish();
});

test('Family persists in a one-person household and includes later eligible members', async () => {
 const s = await setup();
 await s.t.run(async ctx => {
   for (const member of await ctx.db.query('members').collect()) if (member._id !== s.members.admin) await ctx.db.delete(member._id);
 });
 await s.admin.mutation(api.scheduling.setPreferences, { enabled: true, autoCapture: false, availabilityFor: [], availabilitySharing: 'family' });
 expect(await s.admin.query(api.scheduling.preferences, {})).toMatchObject({ availabilitySharing: 'family', availabilityFor: [], people: [] });
 const adult = await s.admin.mutation(api.family.add, { name: 'New adult', role: 'adult', ageGroup: 'adult', relationship: 'partner' });
 const teen = await s.admin.mutation(api.family.add, { name: 'New teen', role: 'kid', ageGroup: 'teen', relationship: 'daughter' });
 const child = await s.admin.mutation(api.family.add, { name: 'New child', role: 'kid', ageGroup: 'child', relationship: 'son' });
 expect((await s.admin.query(api.scheduling.preferences, {})).availabilityFor).toEqual([adult.memberId]);
 await s.admin.mutation(api.family.approveConnections, { memberId: teen.memberId, approved: true });
 expect((await s.admin.query(api.scheduling.preferences, {})).availabilityFor).toEqual(expect.arrayContaining([adult.memberId, teen.memberId]));
 const canSee = (id: Id<'members'>) => s.t.run(async ctx => sharesAvailability(ctx, await ctx.db.query('schedulingPreferences').withIndex('by_family_member', q => q.eq('familyId', s.familyId).eq('memberId', s.members.admin)).unique(), id));
 expect(await canSee(adult.memberId)).toBe(true);
 expect(await canSee(teen.memberId)).toBe(true);
 expect(await canSee(child.memberId)).toBe(false);
 const outsider = await s.t.run(async ctx => {
   const familyId = await ctx.db.insert('families', { name: 'Other family', timezone: tz, parentCode: '54321', createdAt: Date.now() });
   return ctx.db.insert('members', { familyId, name: 'Outsider', role: 'adult', activities: [], hasMega: false });
 });
 expect(await canSee(outsider)).toBe(false);
 await s.admin.mutation(api.family.approveConnections, { memberId: teen.memberId, approved: false });
 expect(await canSee(teen.memberId)).toBe(false);
 await s.admin.mutation(api.scheduling.setSharing, { availabilitySharing: 'private', availabilityFor: [] });
 expect(await canSee(adult.memberId)).toBe(false);
 expect((await s.admin.query(api.scheduling.preferences, {})).availabilitySharing).toBe('private');
 await s.finish();
});

test('legacy explicit sharing stays custom, while Family is honored by actual availability checks', async () => {
 const s = await setup(); await s.share();
 const extra = await s.admin.mutation(api.family.add, { name: 'Later adult', role: 'adult', ageGroup: 'adult', relationship: 'other' });
 expect(await s.admin.query(api.scheduling.preferences, {})).toMatchObject({ availabilitySharing: 'custom', availabilityFor: [s.members.partner] });
 await s.admin.mutation(api.scheduling.setSharing, { availabilitySharing: 'family', availabilityFor: [] });
 expect((await s.admin.query(api.scheduling.preferences, {})).availabilityFor).toContain(extra.memberId);
 await s.ingest('admin', sample('confirmed'));
 await s.ingest('partner', sample('proposed', [slot(12), slot(14)], ['Admin']));
 expect((await s.view()).slots.find(x => x.start === at(12))).toMatchObject({ checked: true, available: false });
 expect((await s.view()).slots.find(x => x.start === at(14))).toMatchObject({ checked: true, available: true });
 await s.admin.mutation(api.scheduling.setSharing, { availabilitySharing: 'private', availabilityFor: [] });
 expect((await s.view()).slots.every(x => !x.checked)).toBe(true);
 await s.finish();
});

test('accepting a confirmed shared meeting saves both calendars, retry is idempotent, cancellation removes both', async () => {
 const s = await setup(); await s.share(); await enableWrites(s); await enableWrites(s, 'admin');
 await s.ingest('partner', { ...sample('proposed', [slot(13)], ['Admin']), selectionConfirms: true });
 const planId = await s.planId('partner');
 await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
 const req = (await s.t.run(ctx => ctx.db.query('requests').collect())).find(r => r.scheduling?.planId === planId)!;
 await s.admin.mutation(api.requests.respond, { requestId: req._id, accept: true });
 await s.finish();
 const accepted = await s.t.run(ctx => ctx.db.get(req._id));
 expect(accepted?.scheduling).toMatchObject({ calendarAuthorized: true, calendarOperation: 'done' });
 const event = await s.t.run(ctx => ctx.db.get(accepted!.scheduling!.calendarEventId!));
 expect(event).toMatchObject({ ownerId: s.members.admin, start: at(13), cancelled: false });
 expect(calendarWrites.filter(w=>w.confirmed)).toHaveLength(2);
 const count = holdCalls;
 await s.admin.mutation(api.requests.syncCalendar, { requestId: req._id });
 await s.finish();
 expect(holdCalls).toBe(count);
 await expect(s.partner.mutation(api.requests.syncCalendar, { requestId: req._id })).rejects.toThrow();
 await s.partner.mutation(api.scheduling.dismiss, { planId });
 await s.finish();
 expect(await s.t.run(ctx => ctx.db.get(event!._id))).toMatchObject({ cancelled: true });
});

test.each(['empty', 'invalid participant field'] as const)('one scheduling email recovers from an %s extraction without a resend', async firstResult => {
 const s = await setup(); await enableWrites(s);
 __setMailSourceForTests(makeFakeMailSource([{ id: 'pickup-one', threadId: 'pickup-thread', internalDate: 100, fromName: 'Studio', fromAddress: 'studio@example.org', subject: 'Confirmed: Partner’s drama pickup', text: 'Your pickup is confirmed October 27, 2026 from 2:30 PM to 3:00 PM America/New_York.' }]));
 let calls = 0;
 __setChatModelForTests(makeFakeChatModel(() => {
   calls++;
   const plan = { title: "Partner's drama pickup", intent: 'confirmed', slots: [{ start: '2026-10-27T14:30', end: '2026-10-27T15:00' }], participantNames: [], missing: [], durationAssumed: false, selectionConfirms: false };
   return jsonReply({ items: [], location: null, plans: calls !== 1 ? [plan] : firstResult === 'empty' ? [] : [{ ...plan, intent: 'review', missing: ['participantNames'] }] });
 }));
 await s.t.action(internal.integrations.syncGmail, { integrationId: s.integrations.partner, firstLook: true });
 expect(calls).toBe(2);
 const view = await s.view();
 expect(view.status).toBe('confirmed');
 expect(view.title).toBe('Your drama pickup');
 expect(view.guidance).toContain('your drama pickup');
 expect(view.eventId).toBeDefined();
 await s.finish();
});

test('reader wording and missing fields never expose schema labels', () => {
 expect(readerTitle("Anela's drama pickup", 'Anela')).toBe('your drama pickup');
 expect(readerTitle("Lovie’s call", 'Anela')).toBe('Lovie’s call');
 expect(schedulingMissingText('participantNames')).toBe('Who else needs to attend with you?');
});

test.each(['chat', 'notification'] as const)('authorized teen explicitly accepts through %s without skipping consent', async surface => {
 const s = await setup(); await enableWrites(s);
 await s.t.run(async ctx => {
   await ctx.db.patch(s.members.twin1, { ageGroup: 'teen', birthday: undefined, connectionsApprovedBy: s.members.admin });
   await ctx.db.insert('schedulingPreferences', { familyId: s.familyId, memberId: s.members.twin1, enabled: true, autoCapture: false, availabilityFor: [s.members.partner] });
 });
 const name = (await s.t.run(ctx => ctx.db.get(s.members.twin1)))!.name;
 await s.ingest('partner', { ...sample('proposed', [slot(13)], [name]), selectionConfirms: true });
 const planId = await s.planId('partner');
 await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) });
 await s.finish();
 expect((await s.t.run(ctx => ctx.db.get(planId)))?.status).toBe('held');
 const req = (await s.t.run(ctx => requestsForPlan(ctx, s.familyId, planId)))[0];
 expect(req).toMatchObject({ toMemberId: s.members.twin1, status: 'open' });
 const teen = s.t.withIdentity({ subject: 'sample:twin1' });
 if (surface === 'chat') await teen.mutation(api.requests.respond, { requestId: req._id, accept: true });
 else {
   expect(req.notificationId).toBeDefined();
   await teen.mutation(api.notifications.answer, { notificationId: req.notificationId!, buttonId: 'yes', via: 'block' });
 }
 await s.finish();
 expect((await s.t.run(ctx => ctx.db.get(planId)))?.status).toBe('confirmed');
 expect((await s.t.run(ctx => ctx.db.get(req._id)))?.scheduling?.calendarAuthorized).toBe(true);
});

test('children and unapproved teens remain in actionable review, never a hold awaiting nonexistent consent', async () => {
 const s = await setup(); await enableWrites(s);
 const name = (await s.t.run(ctx => ctx.db.get(s.members.twin1)))!.name;
 for (const ageGroup of ['child', 'teen'] as const) {
   await s.t.run(ctx => ctx.db.patch(s.members.twin1, { ageGroup, birthday: undefined, connectionsApprovedBy: undefined }));
   await s.ingest('partner', { ...sample('proposed', [slot(13)], [name]), selectionConfirms: true }, `not-approved-${ageGroup}`, ageGroup === 'child' ? 100 : 200);
   const planId = await s.planId('partner');
   const view = await s.view();
   expect(view.status).toBe('review');
   expect(view.missing.join(' ')).toContain('registered parent');
   await expect(s.partner.action(api.scheduling.hold, { planId, revision: view.revision, ...slot(13) })).rejects.toThrow();
   expect(await s.t.run(ctx => requestsForPlan(ctx, s.familyId, planId))).toHaveLength(0);
 }
 await s.finish();
});

test('revoked parent approval blocks a teen response through both surfaces', async () => {
 const s = await setup(); await enableWrites(s);
 await s.t.run(async ctx => {
   await ctx.db.patch(s.members.twin1, { ageGroup: 'teen', birthday: undefined, connectionsApprovedBy: s.members.admin });
   await ctx.db.insert('schedulingPreferences', { familyId: s.familyId, memberId: s.members.twin1, enabled: true, autoCapture: false, availabilityFor: [s.members.partner] });
 });
 const name = (await s.t.run(ctx => ctx.db.get(s.members.twin1)))!.name;
 await s.ingest('partner', { ...sample('proposed', [slot(13)], [name]), selectionConfirms: true });
 const planId = await s.planId('partner');
 await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) }); await s.finish();
 const req = (await s.t.run(ctx => requestsForPlan(ctx, s.familyId, planId)))[0];
 await s.t.run(ctx => ctx.db.patch(s.members.twin1, { connectionsApprovedBy: undefined }));
 const teen = s.t.withIdentity({ subject: 'sample:twin1' });
 await expect(teen.mutation(api.requests.respond, { requestId: req._id, accept: true })).rejects.toThrow();
 await expect(teen.mutation(api.notifications.answer, { notificationId: req.notificationId!, buttonId: 'yes', via: 'block' })).rejects.toThrow();
 expect((await s.t.run(ctx => ctx.db.get(planId)))?.status).toBe('held');
});

test('cancelling an unanswered hold tells the participant once and retires the notification', async () => {
 const s = await setup(); await s.share(); await enableWrites(s);
 await s.ingest('partner', sample('proposed', [slot(13)], ['Admin']));
 const planId = await s.planId('partner');
 await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) }); await s.finish();
 const req = (await s.t.run(ctx => requestsForPlan(ctx, s.familyId, planId)))[0];
 await s.partner.mutation(api.scheduling.dismiss, { planId }); await s.finish();
 await s.partner.mutation(api.scheduling.dismiss, { planId }); await s.finish();
 const rows = await s.t.run(ctx => ctx.db.query('messages').collect());
 expect(rows.filter(m => m.body.type === 'text' && m.body.text.includes('was cancelled. You don’t need'))).toHaveLength(1);
 expect((await s.t.run(ctx => ctx.db.get(req._id)))?.status).toBe('done');
 expect((await s.t.run(ctx => ctx.db.get(req.notificationId!)))?.answer?.buttonId).toBe('cancelled');
});

async function participantWriteFixture() {
 const s = await setup(); await s.share(); await enableWrites(s); await enableWrites(s, 'admin');
 await s.ingest('partner', sample('proposed', [slot(13)], ['Admin']));
 const planId = await s.planId('partner');
 await s.partner.action(api.scheduling.hold, { planId, revision: 1, ...slot(13) }); await s.finish();
 const request = (await s.t.run(ctx => requestsForPlan(ctx, s.familyId, planId)))[0];
 await s.t.run(async ctx => {
   await ctx.db.patch(planId, { status: 'confirmed', slots: [slot(13)], calendarOperation: 'done' });
   await ctx.db.patch(request._id, { status: 'accepted', scheduling: { ...request.scheduling!, calendarAuthorized: true, acceptedSlot: slot(13) } });
 });
 return { ...s, planId, requestId: request._id };
}

test('participant calendar timeout retry rejects stale completion and never duplicates the local event', async () => {
 const s = await participantWriteFixture();
 const first = await s.t.mutation(internal.participantCalendar.claim, { requestId: s.requestId });
 expect(first?.attempt).toBe(1);
 expect(await s.t.mutation(internal.participantCalendar.claim, { requestId: s.requestId })).toBeNull();
 await s.finish(); // actual scheduled timeout
 expect((await s.t.run(ctx => ctx.db.get(s.requestId)))?.scheduling?.calendarOperation).toBe('uncertain');
 const second = await s.t.mutation(internal.participantCalendar.claim, { requestId: s.requestId });
 expect(second?.attempt).toBe(2);
 await s.t.mutation(internal.participantCalendar.finish, { requestId: s.requestId, attempt: 1, ok: true, cancelled: false, externalId: 'stale-event' });
 expect((await s.t.run(ctx => ctx.db.get(s.requestId)))?.scheduling?.calendarOperation).toBe('running');
 await s.t.mutation(internal.participantCalendar.finish, { requestId: s.requestId, attempt: 2, ok: true, cancelled: false, externalId: 'stable-event' });
 await s.t.mutation(internal.participantCalendar.finish, { requestId: s.requestId, attempt: 2, ok: true, cancelled: false, externalId: 'stable-event' });
 await s.finish();
 expect((await s.t.run(ctx => ctx.db.get(s.requestId)))?.scheduling).toMatchObject({ calendarOperation: 'done', calendarExternalId: 'stable-event' });
 expect((await s.t.run(ctx => ctx.db.query('events').collect())).filter(e => e.externalId === 'stable-event')).toHaveLength(1);
 expect((await s.t.run(ctx => ctx.db.query('events').collect())).some(e => e.externalId === 'stale-event')).toBe(false);
 await expect(s.partner.mutation(api.requests.syncCalendar, { requestId: s.requestId })).rejects.toThrow();
});

test('participant creation finishing after cancellation cleans the event without announcing attendance', async () => {
 const s = await participantWriteFixture();
 const claim = await s.t.mutation(internal.participantCalendar.claim, { requestId: s.requestId });
 await s.t.run(ctx => ctx.db.patch(s.planId, { status: 'cancelled' }));
 await s.t.mutation(internal.participantCalendar.finish, { requestId: s.requestId, attempt: claim!.attempt, ok: true, cancelled: false, externalId: 'race-event' });
 await s.finish();
 const request = await s.t.run(ctx => ctx.db.get(s.requestId));
 expect(request?.scheduling).toMatchObject({ calendarOperation: 'done', calendarCancelled: true, calendarExternalId: 'race-event' });
 expect(await s.t.run(ctx => ctx.db.get(request!.scheduling!.calendarEventId!))).toMatchObject({ cancelled: true });
 const texts = (await s.t.run(ctx => ctx.db.query('messages').collect())).flatMap(m => m.body.type === 'text' ? [m.body.text] : []);
 expect(texts.some(t => t.includes('You’re all set for'))).toBe(false);
 expect(texts.filter(t => t.includes('I removed Lunch from your calendar'))).toHaveLength(1);
});
