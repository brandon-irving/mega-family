/// <reference types="vite/client" />
// The spend guard (convex/model/spend.ts, convex/spend.ts): a family's daily cap and the hackathon-build's
// global cap (shared/config/limits.ts LIMITS.spend) both refuse with BUDGET_EXCEEDED before letting a model
// call through — tested here through the internal mutations directly (no real model call needed).
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { LIMITS } from '../shared/config';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

function codeOf(err: unknown): string | undefined {
  return err instanceof ConvexError ? (err.data as { code?: string }).code : undefined;
}

describe('spend guard', () => {
  test('requireBudget refuses once a family would exceed its daily cap', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });

    // Spend right up to the cap.
    await t.mutation(internal.spend.recordUsage, { familyId, cents: LIMITS.spend.centsPerFamilyPerDay - 1 });
    // One more cent of estimate still fits.
    await expect(t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: 1 })).resolves.toBeNull();
    // But a call that would push it over the cap is refused.
    const err = await t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: 5 }).catch((e) => e);
    expect(codeOf(err)).toBe('BUDGET_EXCEEDED');
  });

  test('recordUsage accumulates across calls on the same day', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    await t.mutation(internal.spend.recordUsage, { familyId, tokensIn: 100, tokensOut: 50, cents: 2 });
    await t.mutation(internal.spend.recordUsage, { familyId, tokensIn: 10, tokensOut: 5, cents: 1 });
    const row = await t.run((ctx) => ctx.db.query('usage').withIndex('by_family_day', (q) => q.eq('familyId', familyId)).collect());
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ tokensIn: 110, tokensOut: 55, cents: 3 });
  });

  test("requireBudget refuses once the whole build's global cap would be exceeded, even for a family with its own daily budget untouched", async () => {
    const t = convexTest(schema, modules);
    const { familyId: spenderFamilyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const { familyId: freshFamilyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });

    // Push the global, cross-family total right up to its cap through one family's own (otherwise
    // unrelated) spend — this never pushes that family over ITS OWN daily cap (it's a different number).
    await t.mutation(internal.spend.recordUsage, { familyId: spenderFamilyId, cents: LIMITS.spend.centsTotalUntilG6 - 1 });

    // A brand-new family with zero spend of its own should still be refused: the global cap applies to
    // every family, not just the one that happened to spend the money.
    const err = await t.mutation(internal.spend.requireBudget, { familyId: freshFamilyId, estimatedCents: 5 }).catch((e) => e);
    expect(codeOf(err)).toBe('BUDGET_EXCEEDED');
  });

  test('recordUsage rejects a negative or non-finite cents value', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const err1 = await t.mutation(internal.spend.recordUsage, { familyId, cents: -1 }).catch((e) => e);
    expect(codeOf(err1)).toBe('VALIDATION');
    const err2 = await t.mutation(internal.spend.recordUsage, { familyId, cents: Number.POSITIVE_INFINITY }).catch((e) => e);
    expect(codeOf(err2)).toBe('VALIDATION');
  });
});

// G2 security review (SHOULD-FIX): requireBudget was check-then-act — it only read already-*recorded*
// cents, and the real model call happened in between requireBudget and recordUsage, so two concurrent
// turns could each pass the check and together overshoot the cap. Fixed by making requireBudget reserve
// the estimate atomically (in the same mutation as the check), counting reserved+recorded against both
// caps; recordUsage releases the reservation and records the real cost; releaseReservation releases
// without recording anything (the failed-call path, e.g. a thrown ChatModelError).
describe('spend guard: atomic reservation (concurrent-turn overshoot)', () => {
  test('two reservations that together exceed the daily cap: the second is refused before either records any actual usage', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const cap = LIMITS.spend.centsPerFamilyPerDay;
    const reservation = Math.ceil(cap * 0.6); // two of these together exceed the cap, one alone doesn't
    await expect(t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: reservation })).resolves.toBeNull();
    const err = await t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: reservation }).catch((e) => e);
    expect(codeOf(err)).toBe('BUDGET_EXCEEDED');
    // Neither call has actually recorded real spend yet — only a reservation exists.
    const row = (await t.run((ctx) => ctx.db.query('usage').withIndex('by_family_day', (q) => q.eq('familyId', familyId)).collect()))[0];
    expect(row?.cents ?? 0).toBe(0);
  });

  test('recordUsage releases the reservation and records the real cost, freeing room for a later call', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const cap = LIMITS.spend.centsPerFamilyPerDay;
    await t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: 50 });
    await t.mutation(internal.spend.recordUsage, { familyId, cents: 10, releaseCents: 50 });
    const row = (await t.run((ctx) => ctx.db.query('usage').withIndex('by_family_day', (q) => q.eq('familyId', familyId)).collect()))[0];
    expect(row.cents).toBe(10);
    expect(row.reservedCents ?? 0).toBe(0);
    await expect(t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: cap - 10 - 1 })).resolves.toBeNull();
  });

  test('releaseReservation (a failed model call) releases the hold without recording any usage', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const cap = LIMITS.spend.centsPerFamilyPerDay;
    const reservation = Math.ceil(cap * 0.6);
    await t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: reservation });
    await t.mutation(internal.spend.releaseReservation, { familyId, estimatedCents: reservation });
    const row = (await t.run((ctx) => ctx.db.query('usage').withIndex('by_family_day', (q) => q.eq('familyId', familyId)).collect()))[0];
    expect(row?.cents ?? 0).toBe(0);
    expect(row?.reservedCents ?? 0).toBe(0);
    await expect(t.mutation(internal.spend.requireBudget, { familyId, estimatedCents: reservation })).resolves.toBeNull();
  });
});
