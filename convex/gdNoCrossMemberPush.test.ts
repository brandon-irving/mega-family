/// <reference types="vite/client" />
// GD security review (MEDIUM): the G3 "matters to" trigger (`scanFamilyEventTriggers`) still turned any
// unprocessed `familyEvents` row of type 'said' carrying `mattersToMemberId` + `text` into a push to THAT
// other member — no owner approval, no share suggestion. Since GD the writer only ever makes an owner-gated
// share suggestion (agent/writer.ts → model/layers.ts `suggestShare`), so the branch was unreachable but
// armed: one future writer reusing the payload shape would leak private content across members. Explicit
// share only (STATUS.md, owner Oct 26): no familyEvents payload may cause a cross-member push.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { clock } from './ports/clock';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

describe('explicit share only: no familyEvents payload pushes to another member', () => {
  test("a 'said' row naming another member (the old mattersTo shape) creates no candidate, no notification and no model call", async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const m = members as unknown as Record<'admin' | 'partner', Id<'members'>>;
    let draftCalls = 0;
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (/I'm not well/.test(JSON.stringify(req))) draftCalls++;
        return jsonReply({ kind: 'tip', title: 'FYI', text: 'noted', score: 0.9, reason: 'ok' });
      }),
    );
    const now = await t.run((ctx) => clock.now(ctx, familyId));
    const rowId = await t.run((ctx) =>
      ctx.db.insert('familyEvents', {
        familyId,
        at: now,
        type: 'said',
        payload: { mattersToMemberId: m.admin, fromMemberId: m.partner, text: "I'm not well and haven't told anyone" },
        processed: { memory: true, profiler: false, triggers: false },
      }),
    );

    await t.mutation(internal.proactive.tickFamily, { familyId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const candidates = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId)).collect());
    expect(candidates.filter((c) => c.source?.kind === 'mattersTo')).toHaveLength(0);
    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.filter((n) => /not well/i.test(`${n.title} ${n.body}`))).toHaveLength(0);
    expect(draftCalls).toBe(0);
    const row = await t.run((ctx) => ctx.db.get(rowId));
    expect(row?.processed.triggers).toBe(true); // consumed, so it can't pile up
  });
});
