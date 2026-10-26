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
