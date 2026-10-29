// The Clock port (CONTRACT §8, PLAN.md → Proactive engine "Clock"). Feature code never calls `Date.now()`
// directly — it asks this port for "now", scoped to a family, so the demo's simulated clock (`clock.jump`)
// and tests can move time without the triggers/pipeline code knowing the difference. This module, and
// `convex/seed.ts` (documented separately), are the only places allowed to read the real wall clock.
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type Ctx = QueryCtx | MutationCtx;

export interface ClockPort {
  /** The family's current instant: real time, offset by its `clocks` row (0 unless a demo jump moved it). */
  now(ctx: Ctx, familyId: Id<'families'>): Promise<number>;
  /** The real instant to anchor a brand-new family's clock at. The one place feature code reaches for wall
   * time before a family (and so a `clocks` row) exists yet — onboarding uses it once, to create that row. */
  bootstrap(): number;
  /** G5: the real instant, for expiries an outside provider sets in real time (a Google access token's
   * `expires_in`, an OAuth consent `state`'s TTL while the browser is on Google's page). Never for anything the
   * family sees: a demo clock jump must not make a valid access token look expired, or an expired one valid. */
  realNow(): number;
  /** Moves a family's simulated clock so `now()` reports `to` from here on. Gated by `clock.jump`'s own
   * admin + demo-mode check; this just does the arithmetic and the write. */
  jumpTo(ctx: MutationCtx, familyId: Id<'families'>, to: number): Promise<void>;
}

async function clockRow(ctx: Ctx, familyId: Id<'families'>) {
  return ctx.db
    .query('clocks')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .unique();
}

export const clock: ClockPort = {
  async now(ctx, familyId) {
    const row = await clockRow(ctx, familyId);
    return Date.now() + (row?.offsetMs ?? 0);
  },
  bootstrap() {
    return Date.now();
  },
  realNow() {
    return Date.now();
  },
  async jumpTo(ctx, familyId, to) {
    const row = await clockRow(ctx, familyId);
    const offsetMs = to - Date.now();
    if (row) await ctx.db.patch(row._id, { mode: 'simulated', offsetMs });
    else await ctx.db.insert('clocks', { familyId, mode: 'simulated', offsetMs });
  },
};
