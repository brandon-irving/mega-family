// The spend guard (task brief → "Spend guard"; PLAN.md → Cost). Every model call the agent loop or memory
// writer makes goes through `requireBudget` first and `recordUsage` after, so a family's (and the whole
// hackathon build's) spend never silently runs past the configured caps.
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { LIMITS } from '../../shared/config';
import { localDate } from '../../shared/time';
import { fail } from './errors';
import { clock } from '../ports/clock';

type Ctx = QueryCtx | MutationCtx;

async function todayKey(ctx: Ctx, familyId: Id<'families'>): Promise<string> {
  const family = await ctx.db.get(familyId);
  const now = await clock.now(ctx, familyId);
  return localDate(now, family?.timezone ?? 'UTC');
}

async function familyCentsToday(ctx: Ctx, familyId: Id<'families'>, day: string): Promise<number> {
  const row = await ctx.db
    .query('usage')
    .withIndex('by_family_day', (q) => q.eq('familyId', familyId).eq('day', day))
    .unique();
  return row?.cents ?? 0;
}

/** Hackathon-scoped exception to "no query reads across families" (schema.ts's rule): the `usage` table
 * has exactly one row per family per day, so this is a small, bounded aggregate — and it only ever feeds a
 * single number into this internal guard, never a per-family breakdown to any caller. Before this scales
 * past the hackathon's single $5 cap, replace it with a dedicated counter (e.g. `@convex-dev/aggregate`). */
async function globalCentsAllTime(ctx: Ctx): Promise<number> {
  const rows = await ctx.db.query('usage').collect();
  return rows.reduce((sum, r) => sum + r.cents, 0);
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) fail('VALIDATION', `${label} must be a finite, non-negative number`);
}

/** Throws BUDGET_EXCEEDED before a model call would push the family past its daily cap, or the whole build
 * past the hackathon's global cap (LIMITS.spend). `estimatedCents` should be a pessimistic pre-call estimate
 * (see shared/config/pricing.ts `estimateChatCostCents` / `transcribeCostCents`). */
export async function requireBudget(ctx: MutationCtx, familyId: Id<'families'>, estimatedCents: number): Promise<void> {
  assertFiniteNonNegative(estimatedCents, 'estimatedCents');
  const day = await todayKey(ctx, familyId);
  const familyToday = await familyCentsToday(ctx, familyId, day);
  if (familyToday + estimatedCents > LIMITS.spend.centsPerFamilyPerDay) fail('BUDGET_EXCEEDED', 'daily family spend cap would be exceeded');
  const globalAllTime = await globalCentsAllTime(ctx);
  if (globalAllTime + estimatedCents > LIMITS.spend.centsTotalUntilG6) fail('BUDGET_EXCEEDED', 'the hackathon-build global spend cap would be exceeded');
}

export interface UsageDelta {
  tokensIn?: number;
  tokensOut?: number;
  searches?: number;
  images?: number;
  cents: number;
}

/** Records actual spend after a call completes (the real cost, not the pre-call estimate). */
export async function recordUsage(ctx: MutationCtx, familyId: Id<'families'>, delta: UsageDelta): Promise<void> {
  assertFiniteNonNegative(delta.cents, 'cents');
  for (const [label, v] of Object.entries({ tokensIn: delta.tokensIn, tokensOut: delta.tokensOut, searches: delta.searches, images: delta.images })) {
    if (v !== undefined) assertFiniteNonNegative(v, label);
  }
  const day = await todayKey(ctx, familyId);
  const row = await ctx.db
    .query('usage')
    .withIndex('by_family_day', (q) => q.eq('familyId', familyId).eq('day', day))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, {
      tokensIn: row.tokensIn + (delta.tokensIn ?? 0),
      tokensOut: row.tokensOut + (delta.tokensOut ?? 0),
      searches: row.searches + (delta.searches ?? 0),
      images: row.images + (delta.images ?? 0),
      cents: row.cents + delta.cents,
    });
  } else {
    await ctx.db.insert('usage', {
      familyId,
      day,
      tokensIn: delta.tokensIn ?? 0,
      tokensOut: delta.tokensOut ?? 0,
      searches: delta.searches ?? 0,
      images: delta.images ?? 0,
      cents: delta.cents,
    });
  }
}
