// GD: the one write path for changing an event's title/time/people — `events.update` and an approved clash
// proposal (`proposals.decide`) both go through it, so a fix Hub proposed changes the calendar exactly the
// way a person editing it would. It never touches `scope`: only the owner's share actions do (model/layers.ts).
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { detectClashes } from './clashes';
import { sameFamilyMember } from './viewer';

export type EventPatch = Partial<Pick<Doc<'events'>, 'title' | 'start' | 'end' | 'who' | 'place'>>;

export async function patchEvent(ctx: MutationCtx, event: Doc<'events'>, patch: EventPatch, now: number): Promise<void> {
  if (patch.who) for (const id of patch.who) await sameFamilyMember(ctx, event.familyId, id);
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await ctx.db.patch(event._id, clean);
  await calendarChanged(ctx, event.familyId, now);
}

/** Every household calendar change re-runs Hub's clash check (and marks clashes that went away as stale). */
export async function calendarChanged(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  await detectClashes(ctx, familyId, now);
}
