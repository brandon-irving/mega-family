/// <reference types="vite/client" />
// G2 bug fix (live): convex/agent/context.ts handed the model events as UTC ISO strings and never said
// what "now" is, so Muse Spark guessed "today" from the real calendar instead of the family's (simulated)
// clock. buildContext must now carry a local "now" (shared/time.ts formatLocalDateTime) and show every
// event/reminder in local time with its weekday, not a bare UTC instant.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

describe("agent/context.buildContext: time is shown in the family's local timezone", () => {
  test('the context carries a local "Now:" line and local, weekday-labeled event/reminder times', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.admin)).unique()))!;
    const mega = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.admin)).unique()))!;

    const built = await t.query(internal.agent.context.buildContext, {
      familyId,
      memberId: members.admin,
      megaId: mega._id,
      threadId: thread._id,
      userText: "what's on today?",
    });

    // Demo clock starts Sunday Oct 25 2026, 4:42 PM (shared/fixtures/sampleFamily.ts), family tz America/New_York.
    expect(built.now).toBe('Sunday, Oct 25, 4:42 PM (America/New_York)');
    // Never a raw UTC ISO string anymore.
    expect(built.upcomingEvents.some((e) => e.includes('Z'))).toBe(false);
    // Soccer pickup is seeded at day 0 (Sunday), 4:50 PM — must show in local time with its weekday.
    expect(built.upcomingEvents.some((e) => e.includes('Sun Oct 25, 4:50 PM') && e.includes('Soccer pickup'))).toBe(true);
  });
});

test('creation UI does not push earlier family facts out of conversation context', async () => {
 const t = convexTest(schema, modules);
 const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
 const thread = (await t.run(ctx => ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', familyId).eq('ownerId', members.admin)).unique()))!;
 const original = 'Create a MEGA for Lovie, my partner. We have a 16 year old daughter named Anela. Lovie is a children’s book author.';
 await t.run(async ctx => {
  for (const m of await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', familyId).eq('threadId', thread._id)).collect()) await ctx.db.delete(m._id);
  await ctx.db.insert('messages', { familyId, threadId: thread._id, at: 1, author: { kind: 'member', id: members.admin }, body: { type: 'text', text: original }, via: 'text', chips: [] });
  for (let i=0;i<20;i++) await ctx.db.insert('messages', { familyId, threadId: thread._id, at: i+2, author: { kind: 'system' }, body: { type: 'notice', text: 'Setup complete' }, via: 'text', chips: [] });
  await ctx.db.insert('messages', { familyId, threadId: thread._id, at: 30, author: { kind: 'member', id: members.admin }, body: { type: 'text', text: 'Also create Roll for Anela, purple and sassy.' }, via: 'text', chips: [] });
 });
 const built = await t.query(internal.agent.context.buildContext, { familyId, memberId: members.admin, threadId: thread._id, userText: 'Also create Roll for Anela' });
 expect(built.recentThread.some(m => m.content === original)).toBe(true);
 expect(built.recentThread.at(-1)?.content).toContain('Roll for Anela');
});
test('completed creator drafts preserve family context without reading other creators’ private drafts', async () => {
 const t = convexTest(schema, modules);
 const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
 const thread = (await t.run(ctx => ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', familyId).eq('ownerId', members.admin)).unique()))!;
 await t.run(async ctx => {
  const base = { familyId, threadId: thread._id, status: 'created' as const, revision: 1, updatedAt: 1 };
  await ctx.db.insert('megaDrafts', { ...base, creatorId: members.admin, data: { target: 'new', megaName: 'MEGA', hex: '#2FB8B0', sticker: 'none', personality: 'calm', name: 'Lovie', relationship: 'partner', role: 'adult', brief: { context: 'Parent of 16-year-old daughter Anela', goal: 'Promote her children’s book', firstTask: '', proactive: '' } } });
  await ctx.db.insert('megaDrafts', { ...base, creatorId: members.partner, data: { target: 'new', megaName: 'MEGA', hex: '#2FB8B0', sticker: 'none', personality: 'calm', name: 'Private person', brief: { context: 'PRIVATE_OTHER_CREATOR', goal: '', firstTask: '', proactive: '' } } });
 });
 const built = await t.query(internal.agent.context.buildContext, { familyId, memberId: members.admin, threadId: thread._id, userText: 'Create Roll for Anela' });
 expect(built.creationContext).toContain('16-year-old daughter Anela');
 expect(built.creationContext).not.toContain('PRIVATE_OTHER_CREATOR');
});
