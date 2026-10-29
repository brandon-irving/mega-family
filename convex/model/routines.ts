// GD (CONTRACT v0.13): a kid's morning and bedtime checklists. The sweep creates today's run at the
// routine's time; a bedtime run adds items derived from TOMORROW's household-layer events that include the
// kid (Muse Spark words them, convex/routines.ts `prepBedtime`) — a private event never feeds it.
import { GD_PUSH_COPY } from '../../shared/config/copy';
import { ROUTINES } from '../../shared/config/kids';
import { routineDedupeKey } from '../../shared/config/proactive';
import { HOLIDAYS } from '../../shared/config/shopping';
import { addDays, dayOfWeek, localDate, parseClockTime, zonedInstant } from '../../shared/time';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { addBedtimeNote, isPaused } from './holidays';
import { enqueueCardCandidate } from './proactive';
import { canSeeEvent, layerOf } from './visibility';

type Ctx = QueryCtx | MutationCtx;

/** The kid a routine call is about: a kid → only themselves; an adult → one of their own kids. */
export async function routineSubject(ctx: Ctx, viewer: { member: Doc<'members'>; isParentOf: Id<'members'>[] }, memberId: Id<'members'> | undefined): Promise<Id<'members'>> {
  if (viewer.member.role === 'kid') {
    if (memberId && memberId !== viewer.member._id) fail('FORBIDDEN', 'you can only see your own lists');
    return viewer.member._id;
  }
  if (!memberId) fail('VALIDATION', 'which kid?');
  const kid = await ctx.db.get(memberId);
  if (!kid || kid.familyId !== viewer.member.familyId) fail('NOT_FOUND');
  if (!viewer.isParentOf.includes(kid._id)) fail('FORBIDDEN', 'only their parents can see this');
  return kid._id;
}

export async function routineOf(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>, kind: Doc<'routines'>['kind']): Promise<Doc<'routines'> | null> {
  return ctx.db
    .query('routines')
    .withIndex('by_family_member_kind', (q) => q.eq('familyId', familyId).eq('memberId', memberId).eq('kind', kind))
    .first();
}

export async function runFor(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>, kind: Doc<'routines'>['kind'], date: string): Promise<Doc<'routineRuns'> | null> {
  return ctx.db
    .query('routineRuns')
    .withIndex('by_family_member_kind_date', (q) => q.eq('familyId', familyId).eq('memberId', memberId).eq('kind', kind).eq('date', date))
    .first();
}

/** Tomorrow's household-layer events the kid is in and can see — the only input to bedtime prep. */
export async function tomorrowsHouseholdEventsFor(ctx: Ctx, kid: Doc<'members'>, tz: string, today: string): Promise<Doc<'events'>[]> {
  const tomorrow = addDays(today, 1);
  const from = zonedInstant(tomorrow, 0, tz);
  const to = zonedInstant(addDays(tomorrow, 1), 0, tz) - 1;
  const rows = await ctx.db
    .query('events')
    .withIndex('by_family_start', (q) => q.eq('familyId', kid.familyId).gte('start', from).lte('start', to))
    .collect();
  return rows.filter((e) => !e.cancelled && layerOf(e) === 'household' && e.who.includes(kid._id) && canSeeEvent({ memberId: kid._id, role: kid.role }, e));
}

/** Delivers a run's card (and push) to its kid. */
export async function deliverRoutineCard(ctx: MutationCtx, run: Doc<'routineRuns'>, now: number): Promise<void> {
  const copy = run.kind === 'morning' ? GD_PUSH_COPY.routineMorning : GD_PUSH_COPY.routineBedtime;
  await enqueueCardCandidate(ctx, {
    familyId: run.familyId,
    recipientId: run.memberId,
    kind: 'reminder',
    dedupeKey: routineDedupeKey(run._id),
    title: copy.title,
    text: copy.text,
    source: { kind: 'routine', runId: run._id },
    buttons: 'tip.default',
    now,
  });
}

/** Sweep: at each kid's routine time (on its days), create today's run once and deliver it. A bedtime run
 * with household events tomorrow is handed to `prepBedtime` first, which adds the derived items. */
export async function scanRoutineTriggers(ctx: MutationCtx, familyId: Id<'families'>, tz: string, now: number): Promise<void> {
  const today = localDate(now, tz);
  const weekday = dayOfWeek(today);
  const kids = (
    await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', familyId))
      .collect()
  ).filter((m) => m.role === 'kid' && !!m.authId);
  for (const kid of kids) {
    for (const kind of ['morning', 'bedtime'] as const) {
      const routine = await routineOf(ctx, familyId, kid._id, kind);
      if (!routine || !routine.days.includes(weekday)) continue;
      const minutes = parseClockTime(routine.time) ?? parseClockTime(ROUTINES.defaultTime[kind]);
      if (minutes === null || now < zonedInstant(today, minutes, tz)) continue;
      if (await runFor(ctx, familyId, kid._id, kind, today)) continue;
      // G4b: a grown-up paused today's morning routine for a holiday (HOLIDAYS.pauses.routines).
      if ((HOLIDAYS.pauses.routines as readonly string[]).includes(kind) && (await isPaused(ctx, familyId, kid._id, today))) continue;
      // The routine's own fixed steps; a bedtime run's calendar-derived items go in front (prepBedtime).
      const steps = routine.steps.map((s) => ({ id: s.id, label: s.label, detail: s.detail, done: false }));
      const runId = await ctx.db.insert('routineRuns', { familyId, routineId: routine._id, memberId: kid._id, kind, date: today, steps, createdAt: now });
      // G4b: tomorrow paused for a holiday → the bedtime list opens with "No school routine tomorrow".
      if (kind === 'bedtime') await addBedtimeNote(ctx, (await ctx.db.get(runId))!);
      const run = (await ctx.db.get(runId))!;
      if (kind === 'bedtime' && (await tomorrowsHouseholdEventsFor(ctx, kid, tz, today)).length) {
        await ctx.scheduler.runAfter(0, internal.routines.prepBedtime, { runId });
      } else {
        await deliverRoutineCard(ctx, run, now);
      }
    }
  }
}
