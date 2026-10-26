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
