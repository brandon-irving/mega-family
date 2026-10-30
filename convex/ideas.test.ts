/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  await t.run(async ctx => { for (const idea of await ctx.db.query('ideas').collect()) await ctx.db.delete(idea._id); });
  const admin = t.withIdentity({ subject: 'sample:admin' });
  const partner = t.withIdentity({ subject: 'sample:partner' });
  const kid = t.withIdentity({ subject: 'sample:twin1' });
  const reply = await t.run(async ctx => {
    const thread = (await ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', familyId).eq('ownerId', members.admin)).first())!;
    const messageId = await ctx.db.insert('messages', { familyId, threadId: thread._id, author: { kind: 'mega', id: thread.megaIds[0] }, at: 100, via: 'text', chips: [], body: { type: 'text', text: 'Make a picnic. Bring sandwiches to the park.' } });
    return { thread, messageId };
  });
  return { t, familyId, members, admin, partner, kid, ...reply };
}

describe('Ideas collection', () => {
  test('save is idempotent, private, and has real provenance; other members cannot save or modify it', async () => {
    const { admin, partner, kid, messageId } = await setup();
    const ideaId = await admin.mutation(api.ideas.saveMessage, { messageId, category: 'activities' });
    expect(await admin.mutation(api.ideas.saveMessage, { messageId })).toBe(ideaId);
    const page = await admin.query(api.ideas.list, { paginationOpts });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({ saved: true, category: 'activities', audience: 'Only you', source: { kind: 'message', messageId } });
    expect((await partner.query(api.ideas.list, { paginationOpts })).page).toHaveLength(0);
    await expect(partner.mutation(api.ideas.saveMessage, { messageId })).rejects.toThrow('NOT_FOUND');
    await expect(partner.query(api.ideas.get, { ideaId })).rejects.toThrow('NOT_FOUND');
    await expect(partner.mutation(api.ideas.setSaved, { ideaId, saved: false })).rejects.toThrow('NOT_FOUND');
    await expect(kid.mutation(api.ideas.saveMessage, { messageId })).rejects.toThrow('FORBIDDEN');
    await expect(kid.query(api.ideas.list, { paginationOpts })).rejects.toThrow('FORBIDDEN');
  });

  test('filters, categorization, dismissal and resaving survive refetch', async () => {
    const { admin, messageId } = await setup();
    const ideaId = await admin.mutation(api.ideas.saveMessage, { messageId });
    await admin.mutation(api.ideas.categorize, { ideaId, category: 'meals' });
    expect((await admin.query(api.ideas.list, { category: 'activities', paginationOpts })).page).toHaveLength(0);
    expect((await admin.query(api.ideas.list, { category: 'meals', saved: true, search: 'sandwiches', paginationOpts })).page).toHaveLength(1);
    await admin.mutation(api.ideas.setSaved, { ideaId, saved: false });
    expect((await admin.query(api.ideas.list, { saved: true, paginationOpts })).page).toHaveLength(0);
    await admin.mutation(api.ideas.dismiss, { ideaId });
    expect((await admin.query(api.ideas.list, { paginationOpts })).page).toHaveLength(0);
    await admin.mutation(api.ideas.saveMessage, { messageId });
    expect((await admin.query(api.ideas.list, { saved: true, paginationOpts })).page).toHaveLength(1);
  });

  test('deleted source and cross-family ids cannot expose stale copies', async () => {
    const { t, admin, messageId, familyId } = await setup();
    const ideaId = await admin.mutation(api.ideas.saveMessage, { messageId });
    const other = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    await t.run(async ctx => { for (const member of await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', other.familyId)).collect()) await ctx.db.patch(member._id, { authId: `other:${member._id}` }); });
    await t.run(ctx => ctx.db.patch(ideaId, { familyId: other.familyId }));
    await expect(admin.query(api.ideas.get, { ideaId })).rejects.toThrow('NOT_FOUND');
    await t.run(ctx => ctx.db.patch(ideaId, { familyId }));
    await t.run(ctx => ctx.db.delete(messageId));
    await expect(admin.query(api.ideas.get, { ideaId })).rejects.toThrow('NOT_FOUND');
    expect((await admin.query(api.ideas.list, { paginationOpts })).page).toHaveLength(0);
  });

  test('automatic useful suggestions are unsaved, deduplicated, owner-bound and never available to kids', async () => {
    const { t, admin, familyId, members, thread } = await setup();
    const args = { familyId, memberId: members.admin, threadId: thread._id, megaId: thread.megaIds[0], name: 'ideas_suggest', argumentsJson: JSON.stringify({ title: 'Picnic', text: 'Bring sandwiches to the park.', category: 'activities' }) };
    expect((await t.mutation(internal.agent.tools.execute, args)).ok).toBe(true);
    expect((await t.mutation(internal.agent.tools.execute, args)).ok).toBe(true);
    let page = await admin.query(api.ideas.list, { paginationOpts });
    expect(page.page).toHaveLength(1);
    expect(page.page[0].saved).toBe(false);
    await admin.mutation(api.ideas.dismiss, { ideaId: page.page[0]._id });
    await t.mutation(internal.agent.tools.execute, args);
    page = await admin.query(api.ideas.list, { paginationOpts });
    expect(page.page).toHaveLength(0);
    expect((await t.mutation(internal.agent.tools.execute, { ...args, memberId: members.twin1 })).ok).toBe(false);
    expect((await t.mutation(internal.agent.tools.execute, { ...args, memberId: members.partner })).ok).toBe(false);
  });

  test('gift imports preserve adult recipient exclusion in collection, direct reads, and list copies', async () => {
    const { t, admin, partner, kid, members, familyId } = await setup();
    const set = (await admin.query(api.gifts.upcoming, {}))[0];
    await t.run(ctx => ctx.db.patch(set._id, { forMemberId: members.partner }));
    await admin.mutation(api.ideas.refreshGifts, {});
    await admin.mutation(api.ideas.refreshGifts, {});
    await partner.mutation(api.ideas.refreshGifts, {});
    const ideas = (await admin.query(api.ideas.list, { category: 'gifts', paginationOpts })).page;
    expect(ideas.length).toBe(set.ideas.length);
    expect(ideas[0].audience).toContain('hidden from');
    expect((await partner.query(api.ideas.list, { category: 'gifts', paginationOpts })).page).toHaveLength(0);
    await expect(partner.query(api.ideas.get, { ideaId: ideas[0]._id })).rejects.toThrow('NOT_FOUND');
    const itemId = await admin.mutation(api.gifts.addToList, { giftIdeasId: set._id, index: 0 });
    expect((await admin.query(api.lists.all, {})).flatMap(x => x.items).some(x => x._id === itemId)).toBe(true);
    for (const viewer of [partner, kid]) {
      expect((await viewer.query(api.lists.all, {})).flatMap(x => x.items).some(x => x._id === itemId)).toBe(false);
      await expect(viewer.mutation(api.lists.check, { itemId, checked: true })).rejects.toThrow();
      await expect(viewer.mutation(api.lists.remove, { itemId })).rejects.toThrow();
    }
    const thread = await t.run(ctx => ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', familyId).eq('ownerId', members.partner)).first());
    const item = await t.run(ctx => ctx.db.get(itemId));
    const result = await t.mutation(internal.agent.tools.execute, { familyId, memberId: members.partner, threadId: thread!._id, name: 'lists_check', argumentsJson: JSON.stringify({ listName: 'Gift ideas', itemText: item!.text, checked: true }) });
    expect(result.resultText).toContain("couldn't find");
    expect((await t.run(ctx => ctx.db.get(itemId)))!.checked).toBe(false);
    // If the source audience changes, saved copies are checked again on every read.
    await t.run(ctx => ctx.db.patch(set._id, { forMemberId: members.admin }));
    expect((await admin.query(api.ideas.list, { category: 'gifts', paginationOpts })).page).toHaveLength(0);
  });

  test('old gift list rows fail closed and are restored only from an unambiguous source', async () => {
    const { t, admin } = await setup();
    const set = (await admin.query(api.gifts.upcoming, {}))[0];
    const itemId = await admin.mutation(api.gifts.addToList, { giftIdeasId: set._id, index: 0 });
    await t.run(ctx => ctx.db.patch(itemId, { giftForMemberId: undefined }));
    expect((await admin.query(api.lists.all, {})).flatMap(x => x.items).some(x => x._id === itemId)).toBe(false);
    await admin.mutation(api.ideas.refreshGifts, {});
    expect((await admin.query(api.lists.all, {})).flatMap(x => x.items).some(x => x._id === itemId)).toBe(true);
  });

  test('creating a list enforces audience, name validation, and deduplication', async () => {
    const { admin, partner, kid } = await setup();
    const listId = await admin.mutation(api.lists.create, { name: ' Weekend plans ', scope: 'personal' });
    expect(await admin.mutation(api.lists.create, { name: 'weekend plans', scope: 'personal' })).toBe(listId);
    expect((await partner.query(api.lists.all, {})).some(x => x.list._id === listId)).toBe(false);
    await expect(kid.mutation(api.lists.create, { name: 'Hidden', scope: 'adults' })).rejects.toThrow('FORBIDDEN');
    await expect(admin.mutation(api.lists.create, { name: ' ', scope: 'family' })).rejects.toThrow('VALIDATION');
  });
});

test('date sort applies before pagination, including the second page', async () => {
  const { t, admin, messageId, familyId, members } = await setup();
  const first = await admin.mutation(api.ideas.saveMessage, { messageId });
  const second = await t.run(async ctx => {
    const original = (await ctx.db.get(first))!;
    const { _id, _creationTime, ...fields } = original;
    return ctx.db.insert('ideas', { ...fields, familyId, ownerId: members.admin, at: original.at + 100, sourceKey: 'second', title: 'Second' });
  });
  const newest = await admin.query(api.ideas.list, { sort: 'newest', paginationOpts: { numItems: 1, cursor: null } });
  expect(newest.page[0]._id).toBe(second);
  const next = await admin.query(api.ideas.list, { sort: 'newest', paginationOpts: { numItems: 1, cursor: newest.continueCursor } });
  expect(next.page[0]._id).toBe(first);
  expect((await admin.query(api.ideas.list, { sort: 'oldest', paginationOpts: { numItems: 1, cursor: null } })).page[0]._id).toBe(first);
});
