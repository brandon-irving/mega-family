// The spend guard (task brief → "Spend guard"; PLAN.md → Cost). Every model call the agent loop or memory
// writer makes goes through `requireBudget` first and `recordUsage` after, so a family's (and the whole
// hackathon build's) spend never silently runs past the configured caps.
//
// G2 security review (SHOULD-FIX): this used to be check-then-act — `requireBudget` only read already-
// *recorded* cents, and the real model `fetch` happens in between `requireBudget` and `recordUsage`, so two
// concurrent turns could each pass the same check and together overshoot a cap. `requireBudget` now
// reserves the estimate atomically in the same mutation as the check (Convex mutations serialize per
// document, so two concurrent calls against the same `usage` row can't both read the pre-reservation
// state); both caps count reserved + recorded. `recordUsage` releases the reservation and records the real
// cost; `releaseReservation` releases without recording anything, for a model call that throws.
import type { Doc, Id } from '../_generated/dataModel';
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

async function usageRow(ctx: Ctx, familyId: Id<'families'>, day: string): Promise<Doc<'usage'> | null> {
  return ctx.db
    .query('usage')
    .withIndex('by_family_day', (q) => q.eq('familyId', familyId).eq('day', day))
    .unique();
}

/** Hackathon-scoped exception to "no query reads across families" (schema.ts's rule): the `usage` table
 * has exactly one row per family per day, so this is a small, bounded aggregate — and it only ever feeds a
 * single number into this internal guard, never a per-family breakdown to any caller. Before this scales
 * past the hackathon's single $5 cap, replace it with a dedicated counter (e.g. `@convex-dev/aggregate`). */
async function globalReservedPlusRecordedAllTime(ctx: Ctx): Promise<number> {
  const rows = await ctx.db.query('usage').collect();
  return rows.reduce((sum, r) => sum + r.cents + (r.reservedCents ?? 0), 0);
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) fail('VALIDATION', `${label} must be a finite, non-negative number`);
}

/** Throws BUDGET_EXCEEDED before a model call would push the family past its daily cap, or the whole build
 * past the hackathon's global cap (LIMITS.spend) — counting both already-recorded cost AND any outstanding
 * reservation, then reserves `estimatedCents` itself (atomically with the check) so a concurrent call sees
 * it too. `estimatedCents` should be a pessimistic pre-call estimate (shared/config/pricing.ts
 * `estimateChatCostCents` / `transcribeCostCents`). Release the same amount with `recordUsage` (success) or
 * `releaseReservation` (the call failed) once it's done. */
export async function requireBudget(ctx: MutationCtx, familyId: Id<'families'>, estimatedCents: number): Promise<void> {
  assertFiniteNonNegative(estimatedCents, 'estimatedCents');
  const day = await todayKey(ctx, familyId);
  const row = await usageRow(ctx, familyId, day);
  const familyToday = (row?.cents ?? 0) + (row?.reservedCents ?? 0);
  if (familyToday + estimatedCents > LIMITS.spend.centsPerFamilyPerDay) fail('BUDGET_EXCEEDED', 'daily family spend cap would be exceeded');
  const globalAllTime = await globalReservedPlusRecordedAllTime(ctx);
  if (globalAllTime + estimatedCents > LIMITS.spend.centsTotalUntilG6) fail('BUDGET_EXCEEDED', 'the hackathon-build global spend cap would be exceeded');

  if (row) await ctx.db.patch(row._id, { reservedCents: (row.reservedCents ?? 0) + estimatedCents });
  else await ctx.db.insert('usage', { familyId, day, tokensIn: 0, tokensOut: 0, searches: 0, images: 0, cents: 0, reservedCents: estimatedCents });
}

/** Releases a reservation `requireBudget` made, without recording any actual usage — the failed-call path
 * (e.g. the model threw before a real cost was known). Safe to call even if the row's reservation is
 * already smaller than `estimatedCents` (clamped at 0), so a double-release never goes negative. */
export async function releaseReservation(ctx: MutationCtx, familyId: Id<'families'>, estimatedCents: number): Promise<void> {
  assertFiniteNonNegative(estimatedCents, 'estimatedCents');
  const day = await todayKey(ctx, familyId);
  const row = await usageRow(ctx, familyId, day);
  if (!row) return;
  await ctx.db.patch(row._id, { reservedCents: Math.max(0, (row.reservedCents ?? 0) - estimatedCents) });
}

export interface UsageDelta {
  tokensIn?: number;
  tokensOut?: number;
  searches?: number;
  images?: number;
  cents: number;
  /** The reservation `requireBudget` made for this same call, to release now that the real cost (`cents`)
   * is known. 0 (the default) for a caller that never reserved — recording still works, it just doesn't
   * release anything. */
  releaseCents?: number;
}

/** Records actual spend after a call completes (the real cost, not the pre-call estimate), and releases
 * the matching reservation `requireBudget` made. */
export async function recordUsage(ctx: MutationCtx, familyId: Id<'families'>, delta: UsageDelta): Promise<void> {
  assertFiniteNonNegative(delta.cents, 'cents');
  for (const [label, v] of Object.entries({ tokensIn: delta.tokensIn, tokensOut: delta.tokensOut, searches: delta.searches, images: delta.images, releaseCents: delta.releaseCents })) {
    if (v !== undefined) assertFiniteNonNegative(v, label);
  }
  const day = await todayKey(ctx, familyId);
  const row = await usageRow(ctx, familyId, day);
  const releaseCents = delta.releaseCents ?? 0;
  if (row) {
    await ctx.db.patch(row._id, {
      tokensIn: row.tokensIn + (delta.tokensIn ?? 0),
      tokensOut: row.tokensOut + (delta.tokensOut ?? 0),
      searches: row.searches + (delta.searches ?? 0),
      images: row.images + (delta.images ?? 0),
      cents: row.cents + delta.cents,
      reservedCents: Math.max(0, (row.reservedCents ?? 0) - releaseCents),
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
      reservedCents: 0,
    });
  }
}
