// GD: the demo features' part of the per-family sweep (`tickFamilyLogic`, shared by the cron and
// `clock.jump`): Hub's clash check, proposal expiry, chore reminders, routine runs and gift ideas; G4b: the
// holiday question (before routines and chores, which honor a paused day) and expired price watches.
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { scanChoreTriggers } from './chores';
import { detectClashes } from './clashes';
import { scanGiftTriggers } from './gifts';
import { scanHolidayAsks } from './holidays';
import { sweepProposals } from './proposals';
import { scanRoutineTriggers } from './routines';
import { stopExpiredWatches } from './shopping';

export async function gdTick(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  const family = await ctx.db.get(familyId);
  if (!family) return;
  await sweepProposals(ctx, familyId, now);
  await detectClashes(ctx, familyId, now);
  await scanHolidayAsks(ctx, family, now);
  await scanChoreTriggers(ctx, familyId, family.timezone, now);
  await scanRoutineTriggers(ctx, familyId, family.timezone, now);
  await scanGiftTriggers(ctx, familyId, family.timezone, now);
  await stopExpiredWatches(ctx, familyId, family.timezone, now);
}
