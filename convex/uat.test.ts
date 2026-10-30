/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { clock } from './ports/clock';
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  const seeded = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const admin = t.withIdentity({ subject: 'sample:admin' });
  const partner = t.withIdentity({ subject: 'sample:partner' });
  return { t, admin, partner, ...seeded };
}
test('Today excludes expired and actionable statements, retaining a current informational note', async () => {
  const { t, admin, familyId, members } = await setup();
  await t.run(async ctx => {
    for (const row of await ctx.db.query('candidates').collect()) await ctx.db.delete(row._id);
    const now = await clock.now(ctx, familyId);
    const base = { familyId, recipientId: members.admin, status: 'delivered' as const, delivery: 'statement' as const, score: 1 };
    await ctx.db.insert('candidates', { ...base, kind: 'request', dedupeKey: 'question', draft: { text: 'Can you pick up milk?', buttons: 'request.default' }, window: { from: now - 1000, to: now + 1000 } });
    await ctx.db.insert('candidates', { ...base, kind: 'tip', dedupeKey: 'expired', draft: { text: 'Yesterday', buttons: 'tip.default' }, window: { from: now - 2000, to: now - 1000 } });
    await ctx.db.insert('candidates', { ...base, kind: 'tip', score: 0.4, dedupeKey: 'current', draft: { text: 'A current note', buttons: 'tip.default' }, window: { from: now - 1000, to: now + 1000 } });
  });
  expect((await admin.query(api.today.get, {})).statement?.text).toBe('A current note');
});
test('Family next event skips cancelled and private events belonging to someone else', async () => {
  const { t, admin, familyId, members } = await setup();
  const expected = await t.run(async ctx => {
    const original = (await ctx.db.query('events').first())!;
    const { _id, _creationTime, ...fields } = original;
    for (const event of await ctx.db.query('events').collect()) await ctx.db.delete(event._id);
    const now = await clock.now(ctx, familyId);
    await ctx.db.insert('events', { ...fields, start: now + 100, end: now + 200, scope: 'personal', ownerId: members.partner, createdBy: members.partner });
    await ctx.db.insert('events', { ...fields, start: now + 200, end: now + 300, cancelled: true, scope: 'family' });
    return ctx.db.insert('events', { ...fields, title: 'Next week', start: now + 7 * 86400000, end: now + 7 * 86400000 + 1000, scope: 'family', cancelled: false });
  });
  expect((await admin.query(api.family.nextEvent, {}))?._id).toBe(expected);
});
test('file URLs require permission for their owning chat', async () => {
  const { t, admin, partner, familyId, members } = await setup();
  const messageId = await t.run(async ctx => {
    const storageId = await ctx.storage.store(new Blob(['Synthetic attachment'], { type: 'text/plain' }));
    const thread = (await ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', familyId).eq('ownerId', members.admin)).first())!;
    return ctx.db.insert('messages', { familyId, threadId: thread._id, at: 1, author: { kind: 'member', id: members.admin }, via: 'text', chips: [], body: { type: 'file', storageId, name: 'Test.txt', mimeType: 'text/plain' } });
  });
  expect(await admin.query(api.files.messageUrl, { messageId })).toMatch(/^https?:/);
  await expect(partner.query(api.files.messageUrl, { messageId })).rejects.toThrow('NOT_FOUND');
});
