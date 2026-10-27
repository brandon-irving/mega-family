/// <reference types="vite/client" />
// G3 security review S3 (MEDIUM): a per-family-per-day cap on mattersTo-sourced model calls
// (`PROACTIVE.mattersToDailyCapPerFamily`, shared/config/proactive.ts). Past the cap, a mattersTo trigger
// is dropped and logged instead of spending a real draft+judge model call.
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { checkinDedupeKey } from '../shared/config/proactive';
import { SAMPLE_FAMILY } from '../shared/fixtures/sampleFamily';
import { localDate } from '../shared/time';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { clock } from './ports/clock';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
const TZ = SAMPLE_FAMILY.timezone;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  // Blocks the daily check-in trigger from sneaking in an incidental model call that would make this
  // suite's exact `modelCalls` counts flaky (convex/model/proactive.ts `scanCheckInTriggers`) — same
  // determinism concern convex/proactive.test.ts's own tests call out, just closed at the source instead
  // of relying on the fake model to score it away.
  const demoNow = await t.run((ctx) => clock.now(ctx, familyId));
  const today = localDate(demoNow, TZ);
  for (const memberId of [members.admin, members.partner] as Id<'members'>[]) {
    await t.run((ctx) =>
      ctx.db.insert('candidates', {
        familyId,
        recipientId: memberId,
        kind: 'update',
        dedupeKey: checkinDedupeKey(memberId, today),
        draft: { text: 'pre-blocked for test determinism', buttons: 'update.default' },
        window: { from: demoNow, to: demoNow },
        status: 'dropped',
        reason: 'pre-blocked for test determinism',
        delivery: 'drop',
      }),
    );
  }
  return { t, familyId, members: members as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>> };
}

async function insertMattersToEvent(t: TestConvex<typeof schema>, familyId: Id<'families'>, fromMemberId: Id<'members'>, toMemberId: Id<'members'>, text: string, at: number) {
  return t.run((ctx) => ctx.db.insert('familyEvents', { familyId, at, type: 'said', payload: { mattersToMemberId: toMemberId, fromMemberId, text }, processed: { memory: true, profiler: false, triggers: false } }));
}

describe('S3: a per-family-per-day cap on mattersTo-sourced model calls', () => {
  test('past the cap, a mattersTo trigger is dropped and logged instead of spending a model call', async () => {
    const { t, familyId, members } = await seeded();
    let modelCalls = 0;
    __setChatModelForTests(makeFakeChatModel(() => {
      modelCalls++;
      return jsonReply({ kind: 'tip', title: 'FYI', text: 'noted', score: 0.5, reason: 'ok' });
    }));

    const now = await t.run((ctx) => clock.now(ctx, familyId)); // the family's own (possibly simulated) clock, not raw Date.now()
    const cap = 20; // PROACTIVE.mattersToDailyCapPerFamily
    // Pre-fill today's count right up to the cap with already-counted mattersTo candidates, bypassing the
    // trigger scanner so the test doesn't need `cap` real ticks. `window.from` carries `now`, exactly like
    // a real mattersTo candidate the scanner would have created — the cap counts by that field, not by
    // `_creationTime` (see convex/model/proactive.ts `mattersToModelCallsToday`).
    for (let i = 0; i < cap; i++) {
      const eventId = await t.run((ctx) =>
        ctx.db.insert('familyEvents', { familyId, at: now, type: 'said', payload: { mattersToMemberId: members.admin, fromMemberId: members.partner, text: `filler ${i}` }, processed: { memory: true, profiler: false, triggers: true } }),
      );
      await t.run((ctx) =>
        ctx.db.insert('candidates', {
          familyId,
          recipientId: members.admin,
          kind: 'tip',
          dedupeKey: `mattersTo:${eventId}`,
          draft: { text: `filler ${i}`, buttons: 'tip.default' },
          window: { from: now, to: now + 1000 },
          status: 'dropped',
          reason: 'filler',
          delivery: 'drop',
          source: { kind: 'mattersTo', fromMemberId: members.partner, familyEventId: eventId },
        }),
      );
    }

    // one more, over the cap
    await insertMattersToEvent(t, familyId, members.partner, members.admin, 'We are completely out of milk again.', now);
    await t.mutation(internal.proactive.tickFamily, { familyId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(modelCalls).toBe(0); // capped — never spent a draft+judge call

    const rows = await t.run((ctx) => ctx.db.query('familyEvents').withIndex('by_family_at', (q) => q.eq('familyId', familyId)).collect());
    const cappedLog = rows.find((r) => (r.payload as any)?.mattersToCapped);
    expect(cappedLog).toBeDefined(); // dropped AND logged, not silently discarded

    const candidates = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'new')).collect());
    expect(candidates.some((c) => c.source?.kind === 'mattersTo')).toBe(false); // no new candidate created for the over-cap trigger
  });

  test('control: under the cap, a mattersTo trigger still produces a candidate and spends the model call', async () => {
    const { t, familyId, members } = await seeded();
    let modelCalls = 0;
    __setChatModelForTests(makeFakeChatModel(() => {
      modelCalls++;
      return jsonReply({ kind: 'tip', title: 'FYI', text: 'noted', score: 0.5, reason: 'ok' });
    }));

    const now = Date.now();
    await insertMattersToEvent(t, familyId, members.partner, members.admin, 'We are completely out of milk again.', now);
    await t.mutation(internal.proactive.tickFamily, { familyId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(modelCalls).toBeGreaterThan(0);
  });
});
