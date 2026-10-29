// GD (CONTRACT v0.13): chores. A chore repeats on `days` at `time`; each day gets one `choreClaims` row
// (due → claimed when the kid taps Done → approved when an adult releases Mega Bucks, or declined). The
// reminder and the adults' approve card go through the normal push pipeline (kid quiet hours, caps).
import { CHORES } from '../../shared/config/kids';
import { GD_PUSH_COPY, fillCopy } from '../../shared/config/copy';
import { choreApproveDedupeKey, choreRemindDedupeKey } from '../../shared/config/proactive';
import { HOLIDAYS } from '../../shared/config/shopping';
import { dayOfWeek, localDate, parseClockTime, zonedInstant } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { isPaused } from './holidays';
import { enqueueCardCandidate } from './proactive';

type Ctx = QueryCtx | MutationCtx;

export function isManager(role: Doc<'members'>['role']): boolean {
  return (CHORES.managers as readonly string[]).includes(role);
}

export function validateSchedule(days: number[], time: string): void {
  if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) fail('VALIDATION', 'days must be 0 (Sunday) to 6');
  if (parseClockTime(time) === null) fail('VALIDATION', 'time must be HH:MM');
}

export async function claimFor(ctx: Ctx, chore: Doc<'chores'>, date: string): Promise<Doc<'choreClaims'> | null> {
  return ctx.db
    .query('choreClaims')
    .withIndex('by_family_chore_date', (q) => q.eq('familyId', chore.familyId).eq('choreId', chore._id).eq('date', date))
    .first();
}

export async function choreViewOf(ctx: Ctx, chore: Doc<'chores'>, tz: string, now: number) {
  return { chore, today: await claimFor(ctx, chore, localDate(now, tz)) };
}

/** The kid taps Done (from the card or the push's Done button): claims today's instance, idempotently, and
 * asks the adults to approve it. */
export async function markChoreDone(ctx: MutationCtx, params: { chore: Doc<'chores'>; kid: Doc<'members'>; tz: string; now: number }): Promise<Id<'choreClaims'>> {
  const { chore, kid, now } = params;
  if (chore.forMemberId !== kid._id) fail('FORBIDDEN', 'that’s not your chore');
  if (!chore.active) fail('VALIDATION', 'that chore is turned off');
  const date = localDate(now, params.tz);
  const existing = await claimFor(ctx, chore, date);
  let claimId: Id<'choreClaims'>;
  if (existing && (existing.status === 'claimed' || existing.status === 'approved')) return existing._id;
  if (existing) {
    await ctx.db.patch(existing._id, { status: 'claimed', claimedAt: now, decidedById: undefined, decidedAt: undefined });
    claimId = existing._id;
  } else {
    claimId = await ctx.db.insert('choreClaims', { familyId: chore.familyId, choreId: chore._id, forMemberId: kid._id, date, status: 'claimed', claimedAt: now });
  }
  await askAdultsToApprove(ctx, { chore, kid, claimId, now });
  return claimId;
}

export async function askAdultsToApprove(ctx: MutationCtx, params: { chore: Doc<'chores'>; kid: Doc<'members'>; claimId: Id<'choreClaims'>; now: number }): Promise<void> {
  const adults = (
    await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', params.chore.familyId))
      .collect()
  ).filter((m) => isManager(m.role) && !!m.authId);
  const copy = GD_PUSH_COPY.choreApprove;
  for (const adult of adults) {
    await enqueueCardCandidate(ctx, {
      familyId: params.chore.familyId,
      recipientId: adult._id,
      kind: 'update',
      dedupeKey: choreApproveDedupeKey(params.claimId, adult._id),
      title: fillCopy(copy.title, { kid: params.kid.name, chore: params.chore.title }),
      text: fillCopy(copy.text, { kid: params.kid.name, chore: params.chore.title, bucks: params.chore.bucks }),
      source: { kind: 'chore', claimId: params.claimId },
      now: params.now,
    });
  }
}

/** The push's "In 10 min" (snooze_10): the same reminder again after CHORES.snoozeMinutes, through the
 * normal timing pipeline. Cancelled at delivery if the kid tapped Done in the meantime. */
export async function snoozeChoreReminder(ctx: MutationCtx, params: { chore: Doc<'chores'>; claimId: Id<'choreClaims'>; now: number }): Promise<void> {
  const copy = GD_PUSH_COPY.choreRemind;
  await enqueueCardCandidate(ctx, {
    familyId: params.chore.familyId,
    recipientId: params.chore.forMemberId,
    kind: 'reminder',
    dedupeKey: `${choreRemindDedupeKey(params.claimId)}:snooze:${params.now}`,
    title: fillCopy(copy.title, { chore: params.chore.title }),
    text: fillCopy(copy.text, { chore: params.chore.title }),
    source: { kind: 'chore', claimId: params.claimId },
    buttons: 'chore.default',
    now: params.now,
    notBefore: params.now + CHORES.snoozeMinutes * 60_000,
  });
}

/** Sweep: once a chore's time has come today, make sure today's claim exists and remind the kid (Done /
 * Later buttons). Deduped per claim; kid quiet hours hold it like any other push. */
export async function scanChoreTriggers(ctx: MutationCtx, familyId: Id<'families'>, tz: string, now: number): Promise<void> {
  const today = localDate(now, tz);
  const weekday = dayOfWeek(today);
  const kids = (
    await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', familyId))
      .collect()
  ).filter((m) => m.role === 'kid');
  for (const kid of kids) {
    const chores = await ctx.db
      .query('chores')
      .withIndex('by_family_for', (q) => q.eq('familyId', familyId).eq('forMemberId', kid._id))
      .collect();
    for (const chore of chores) {
      if (!chore.active || !chore.days.includes(weekday)) continue;
      const minutes = parseClockTime(chore.time);
      if (minutes === null) continue;
      const dueAt = zonedInstant(today, minutes, tz) - CHORES.remindLeadMinutes * 60_000;
      if (now < dueAt) continue;
      // G4b: a grown-up paused today's chores for a holiday.
      if (HOLIDAYS.pauses.chores && (await isPaused(ctx, familyId, kid._id, today))) continue;
      let claim = await claimFor(ctx, chore, today);
      if (!claim) {
        const claimId = await ctx.db.insert('choreClaims', { familyId, choreId: chore._id, forMemberId: kid._id, date: today, status: 'due' });
        claim = (await ctx.db.get(claimId))!;
      }
      if (claim.status !== 'due') continue;
      const copy = GD_PUSH_COPY.choreRemind;
      await enqueueCardCandidate(ctx, {
        familyId,
        recipientId: kid._id,
        kind: 'reminder',
        dedupeKey: choreRemindDedupeKey(claim._id),
        title: fillCopy(copy.title, { chore: chore.title }),
        text: fillCopy(copy.text, { chore: chore.title }),
        source: { kind: 'chore', claimId: claim._id },
        buttons: 'chore.default',
        now,
      });
    }
  }
}
