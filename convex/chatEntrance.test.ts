/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { CHAT_UX } from '../shared/config/chat';
const modules = import.meta.glob('./**/*.ts');
async function setup() {
  const t = convexTest(schema, modules);
  const { members, familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const admin = t.withIdentity({ subject: 'sample:admin' });
  const own = await t.run(async ctx => {
    const row = await ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', familyId).eq('ownerId', members.admin)).unique();
    for (const m of await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', familyId).eq('threadId', row!._id)).collect()) await ctx.db.delete(m._id);
    return row!;
  });
  return { t, admin, members, familyId, own };
}
test('first meet is pending even when the greeting is already saved; completion persists without changing chat.start', async () => {
  const s = await setup();
  await s.t.run(ctx => ctx.db.insert('messages', { familyId: s.familyId, threadId: s.own._id, at: 1, author: { kind: 'mega', id: s.own.megaIds[0] }, via: 'text', chips: [], body: { type: 'text', text: 'Hello' } }));
  const args = { profileKey: s.members.admin };
  expect(await s.admin.query(api.chat.entrance, args)).toEqual({ pending: true });
  await s.admin.mutation(api.chat.finishEntrance, args);
  const first = await s.t.run(ctx => ctx.db.get(s.own._id));
  await s.admin.mutation(api.chat.finishEntrance, args);
  expect(await s.admin.query(api.chat.entrance, args)).toEqual({ pending: false });
  expect(await s.t.run(ctx => ctx.db.get(s.own._id))).toEqual(first);
  expect(first!.startedAt).toBe(s.own.startedAt);
});
test('existing member messages skip the entrance; profile switches cannot acknowledge someone else', async () => {
  const s = await setup();
  await s.t.run(ctx => ctx.db.insert('messages', { familyId: s.familyId, threadId: s.own._id, at: 1, author: { kind: 'member', id: s.members.admin }, via: 'text', chips: [], body: { type: 'text', text: 'Hi' } }));
  expect(await s.admin.query(api.chat.entrance, { profileKey: s.members.admin })).toEqual({ pending: false });
  expect(await s.admin.query(api.chat.entrance, { profileKey: s.members.partner })).toEqual({ pending: false });
  await expect(s.admin.mutation(api.chat.finishEntrance, { profileKey: s.members.partner })).rejects.toThrow();
});
test('long existing histories never replay an introduction even when the recent page is all MEGA', async () => {
  const s = await setup();
  await s.t.run(async ctx => {
    for (let i = 0; i < CHAT_UX.entrance.maxHistory; i++) await ctx.db.insert('messages', { familyId: s.familyId, threadId: s.own._id, at: i, author: { kind: 'mega', id: s.own.megaIds[0] }, via: 'text', chips: [], body: { type: 'text', text: 'Update' } });
  });
  expect(await s.admin.query(api.chat.entrance, { profileKey: s.members.admin })).toEqual({ pending: false });
});
