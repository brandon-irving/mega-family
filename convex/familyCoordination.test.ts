/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { clock } from './ports/clock';
import { candidateStillApplies, buildPushMessages } from './model/proactive';
import { maybeSuggestEventShare, notifyParentsOfTeenEvent } from './model/layers';
import { applyExternalEvents } from './model/integrations';
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const kid = (await t.run(ctx => ctx.db.query('members').collect())).find(m => m.role === 'kid' && m.authId)!;
  await t.run(ctx => ctx.db.patch(kid._id, { ageGroup: 'teen', birthday: undefined }));
  const now = await t.run(ctx => clock.now(ctx, familyId));
  return { t, familyId, kid, now, teen: t.withIdentity({ subject: kid.authId! }) };
}
test('new private teen event asks its owner; only explicit sharing alerts parents once', async () => {
  const { t, familyId, kid, now, teen } = await setup();
  const eventId = await teen.mutation(api.events.create, { title: 'School rehearsal', start: now + 86400000, end: now + 90000000, who: [kid._id], scope: 'personal' });
  const suggestions = await teen.query(api.shareSuggestions.mine, {});
  const suggestion = suggestions.find(s => s.item.kind === 'event' && s.item.eventId === eventId)!;
  expect(suggestion).toBeTruthy();
  const candidates = () => t.run(ctx => ctx.db.query('candidates').collect());
  expect((await candidates()).filter(c => c.source?.kind === 'teenCalendar')).toHaveLength(0);
  await teen.mutation(api.shareSuggestions.answer, { suggestionId: suggestion._id, share: true });
  const alerts = (await candidates()).filter(c => c.source?.kind === 'teenCalendar');
  expect(alerts).toHaveLength(2);
  await t.run(async ctx => notifyParentsOfTeenEvent(ctx, (await ctx.db.get(eventId))!, now));
  expect((await candidates()).filter(c => c.source?.kind === 'teenCalendar')).toHaveLength(2);
  for (const alert of alerts) expect(await t.run(ctx => candidateStillApplies(ctx, alert.source, alert.recipientId))).toBe(true);
  const admin = t.withIdentity({ subject: 'sample:admin' });
  expect((await admin.query(api.calendar.event, { eventId })).event.title).toBe('School rehearsal');
  await teen.mutation(api.events.unshare, { eventId });
  await expect(admin.query(api.calendar.event, { eventId })).rejects.toThrow();
  expect((await teen.query(api.calendar.event, { eventId })).event.title).toBe('School rehearsal');
  for (const alert of alerts) expect(await t.run(ctx => candidateStillApplies(ctx, alert.source, alert.recipientId))).toBe(false);
  const family = await t.run(ctx => ctx.db.get(familyId));
  await t.run(async ctx => maybeSuggestEventShare(ctx, (await ctx.db.get(eventId))!, family!.timezone, now));
  expect((await t.run(ctx => ctx.db.query('shareSuggestions').collect())).filter(s => s.item.kind === 'event' && s.item.eventId === eventId)).toHaveLength(1);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
test('initial calendar import is quiet; a later new teen event asks once and stays private', async () => {
  const { t, familyId, kid, now } = await setup();
  const integrationId = await t.run(ctx => ctx.db.insert('integrations', { familyId, memberId: kid._id, kind: 'googleCalendar', status: 'connected', config: {} }));
  const event = { cancelled: false, externalId: 'first', title: 'Rehearsal', start: now + 86400000, end: now + 90000000 };
  await t.run(async ctx => applyExternalEvents(ctx, (await ctx.db.get(integrationId))!, [event], {}));
  expect((await t.run(ctx => ctx.db.query('shareSuggestions').collect())).filter(s => s.ownerId === kid._id)).toHaveLength(0);
  await t.run(ctx => ctx.db.patch(integrationId, { lastSyncAt: now }));
  for (let i = 0; i < 2; i++) await t.run(async ctx => applyExternalEvents(ctx, (await ctx.db.get(integrationId))!, [event, { ...event, externalId: 'second' }], {}));
  const suggestions = (await t.run(ctx => ctx.db.query('shareSuggestions').collect())).filter(s => s.ownerId === kid._id);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].ownerId).toBe(kid._id);
  expect((await t.run(ctx => ctx.db.query('events').collect())).filter(e => e.integrationId === integrationId).every(e => e.scope === 'personal')).toBe(true);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
test('coordination pushes use a generic lock-screen body', () => {
  for (const kind of ['mailPlan', 'teenCalendar', 'connectionApproval'] as const) {
    const notification = { _id: 'notice' as never, kind: 'update' as const, body: 'Private schedule details', buttons: [], loudness: 'passive' as const, megaId: 'mega' as never };
    const messages = buildPushMessages(notification, 'Teal', 'thread' as never, 'message' as never, [{ token: 'token', platform: 'ios' }], '', kind);
    expect(messages[0].body).toBe('Teal has a message for you');
  }
});
