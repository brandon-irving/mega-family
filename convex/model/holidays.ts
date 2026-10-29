// G4b (CONTRACT v0.16): public holidays. A family's holidays are cached per country × year (Nager.Date through
// the Holidays port; public data). The evening before a weekday holiday on which a kid has a morning routine or a
// chore, MEGA asks the adults instead of deciding (invariant 9: a federal holiday isn't always a day off school).
// `paused` skips that day's morning routine and chores for those kids and adds a note to the bedtime prep the
// night before; `kept` changes nothing; nothing pauses without an answer.
import { G4B_COPY, fillCopy } from '../../shared/config/copy';
import { holidayDedupeKey } from '../../shared/config/proactive';
import { HOLIDAYS } from '../../shared/config/shopping';
import type { Holiday } from '../../shared/domain/integrationShapes';
import { addDays, dayOfWeek, localDate, parseClockTime, zonedInstant } from '../../shared/time';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { enqueueCardCandidate } from './proactive';

type Ctx = QueryCtx | MutationCtx;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function familyCountry(family: Doc<'families'>): string {
  return (family.country ?? HOLIDAYS.defaultCountry).toUpperCase();
}

/** The years a family's calendar can show: this one and next (by the family's clock). */
export function yearsInView(now: number, tz: string): number[] {
  const y = Number(localDate(now, tz).slice(0, 4));
  return [y, y + 1];
}

export async function cacheRow(ctx: Ctx, familyId: Id<'families'>, country: string, year: number): Promise<Doc<'holidays'> | null> {
  return ctx.db
    .query('holidays')
    .withIndex('by_family_country_year', (q) => q.eq('familyId', familyId).eq('country', country).eq('year', year))
    .unique();
}

/** Only the holidays MEGA acts on: HOLIDAYS.types (Public), nationwide only (we don't store the family's state). */
export function counts(h: Holiday): boolean {
  return h.types.some((t) => (HOLIDAYS.types as readonly string[]).includes(t)) && (h.global || !HOLIDAYS.globalOnly);
}

export async function holidaysBetween(ctx: Ctx, family: Doc<'families'>, from: string, to: string): Promise<Holiday[]> {
  const country = familyCountry(family);
  const years = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])];
  const out: Holiday[] = [];
  for (const year of years) {
    const row = await cacheRow(ctx, family._id, country, year);
    for (const h of row?.list ?? []) if (counts(h) && h.date >= from && h.date <= to) out.push(h);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function skipOn(ctx: Ctx, familyId: Id<'families'>, date: string): Promise<Doc<'routineSkips'> | null> {
  return ctx.db
    .query('routineSkips')
    .withIndex('by_family_date', (q) => q.eq('familyId', familyId).eq('date', date))
    .first();
}

/** True when a grown-up paused `date` for this kid (routines, chores and bedtime prep honor it). */
export async function isPaused(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>, date: string): Promise<boolean> {
  const skip = await skipOn(ctx, familyId, date);
  return !!skip && skip.status === 'paused' && skip.memberIds.includes(memberId);
}

/** The bedtime note a paused holiday puts first on the kid's list the night before. */
export function bedtimeNoteStep(holidayName: string) {
  return { id: HOLIDAYS.bedtimeNoteStepId, label: fillCopy(G4B_COPY.bedtimeNoRoutine, { name: holidayName }).slice(0, 60), done: false };
}

/** Puts the note at the top of a bedtime run (once), when the next day is paused for its kid. */
export async function addBedtimeNote(ctx: MutationCtx, run: Doc<'routineRuns'>): Promise<void> {
  if (run.kind !== 'bedtime' || run.finishedAt !== undefined || run.steps.some((s) => s.id === HOLIDAYS.bedtimeNoteStepId)) return;
  const skip = await skipOn(ctx, run.familyId, addDays(run.date, 1));
  if (!skip || skip.status !== 'paused' || !skip.memberIds.includes(run.memberId)) return;
  await ctx.db.patch(run._id, { steps: [bedtimeNoteStep(skip.holidayName), ...run.steps] });
}

/** Keeps the cache warm: a missing or expired year schedules one refresh (and pushes the row's expiry out an
 * hour first, so the sweep doesn't schedule it again while that fetch is in flight). Queries can't fetch. */
export async function ensureHolidayCache(ctx: MutationCtx, family: Doc<'families'>, now: number): Promise<void> {
  const country = familyCountry(family);
  let stale = false;
  for (const year of yearsInView(now, family.timezone)) {
    const row = await cacheRow(ctx, family._id, country, year);
    if (row && row.expiresAt > now) continue;
    stale = true;
    if (row) await ctx.db.patch(row._id, { expiresAt: now + HOUR });
    else await ctx.db.insert('holidays', { familyId: family._id, country, year, list: [], fetchedAt: 0, expiresAt: now + HOUR });
  }
  if (stale) await ctx.scheduler.runAfter(0, internal.holidays.refreshFamily, { familyId: family._id });
}

/** Writes one fetched year. A failure keeps the last good list (a blip doesn't erase holidays). */
export async function storeYear(
  ctx: MutationCtx,
  p: { familyId: Id<'families'>; country: string; year: number; now: number; result: { ok: true; list: Holiday[] } | { ok: false; failure: Doc<'holidays'>['failure'] & string } },
): Promise<void> {
  const row = await cacheRow(ctx, p.familyId, p.country, p.year);
  const fields = p.result.ok
    ? { list: p.result.list, fetchedAt: p.now, expiresAt: p.now + HOLIDAYS.refreshDays * DAY, failure: undefined }
    : { expiresAt: p.now + 6 * HOUR, failure: p.result.failure };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert('holidays', { familyId: p.familyId, country: p.country, year: p.year, list: [], fetchedAt: p.now, ...fields });
}

async function membersOf(ctx: Ctx, familyId: Id<'families'>): Promise<Doc<'members'>[]> {
  return ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
}

/** Kids with a morning routine or an active chore on `date` (the ones a pause would affect). */
async function kidsBusyOn(ctx: Ctx, familyId: Id<'families'>, date: string): Promise<Doc<'members'>[]> {
  const weekday = dayOfWeek(date);
  const out: Doc<'members'>[] = [];
  for (const kid of (await membersOf(ctx, familyId)).filter((m) => m.role === 'kid')) {
    const routines = await ctx.db
      .query('routines')
      .withIndex('by_family_member_kind', (q) => q.eq('familyId', familyId).eq('memberId', kid._id))
      .collect();
    const routineThatDay = routines.some((r) => (HOLIDAYS.pauses.routines as readonly string[]).includes(r.kind) && r.days.includes(weekday));
    const chores = HOLIDAYS.pauses.chores
      ? await ctx.db
          .query('chores')
          .withIndex('by_family_for', (q) => q.eq('familyId', familyId).eq('forMemberId', kid._id))
          .collect()
      : [];
    if (routineThatDay || chores.some((c) => c.active && c.days.includes(weekday))) out.push(kid);
  }
  return out;
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** The weekday name of a local "YYYY-MM-DD" date ("Wednesday"). */
export function weekdayOf(date: string): string {
  return WEEKDAYS[dayOfWeek(date)];
}

/** Sweep (the GD tick): from HOLIDAYS.askAt the evening before a weekday holiday the kids would be busy on,
 * one `routineSkips` row (`asked`) and a `holiday` question to each grown-up with a login. Once per date. */
export async function scanHolidayAsks(ctx: MutationCtx, family: Doc<'families'>, now: number): Promise<void> {
  await ensureHolidayCache(ctx, family, now);
  const tz = family.timezone;
  const today = localDate(now, tz);
  const askAt = parseClockTime(HOLIDAYS.askAt);
  if (askAt === null || now < zonedInstant(today, askAt, tz)) return;
  const tomorrow = addDays(today, 1);
  const weekday = dayOfWeek(tomorrow);
  if (HOLIDAYS.weekdaysOnly && (weekday === 0 || weekday === 6)) return;
  const holiday = (await holidaysBetween(ctx, family, tomorrow, tomorrow))[0];
  if (!holiday || (await skipOn(ctx, family._id, tomorrow))) return;
  const kids = await kidsBusyOn(ctx, family._id, tomorrow);
  if (!kids.length) return;
  const skipId = await ctx.db.insert('routineSkips', { familyId: family._id, date: tomorrow, holidayName: holiday.name, memberIds: kids.map((k) => k._id), status: 'asked', askedAt: now });
  const values = { day: weekdayOf(tomorrow), name: holiday.name, kids: joinNames(kids.map((k) => k.name)) };
  for (const adult of (await membersOf(ctx, family._id)).filter((m) => m.role !== 'kid' && !!m.authId)) {
    await enqueueCardCandidate(ctx, {
      familyId: family._id,
      recipientId: adult._id,
      kind: 'request',
      dedupeKey: holidayDedupeKey(skipId, adult._id),
      title: fillCopy(G4B_COPY.holidayQuestionTitle, values),
      text: fillCopy(G4B_COPY.holidayQuestion, values),
      source: { kind: 'holiday', skipId },
      buttons: 'holiday.default',
      now,
    });
  }
}

/** Grown-ups only; kids are FORBIDDEN, another family's row NOT_FOUND. */
export async function requireSkipForAdult(ctx: Ctx, member: Doc<'members'>, skipId: Id<'routineSkips'>): Promise<Doc<'routineSkips'>> {
  if (member.role === 'kid') fail('FORBIDDEN', 'grown-ups decide this one');
  const skip = await ctx.db.get(skipId);
  if (!skip || skip.familyId !== member.familyId) fail('NOT_FOUND');
  return skip;
}

async function outcomeMessage(ctx: Ctx, skip: Doc<'routineSkips'>): Promise<string> {
  const by = skip.answeredBy ? ((await ctx.db.get(skip.answeredBy))?.name ?? 'a grown-up') : 'a grown-up';
  return fillCopy(skip.status === 'paused' ? G4B_COPY.holidayPaused : G4B_COPY.holidayKept, { day: weekdayOf(skip.date), by });
}

/** "Pause for the day" / "Keep as usual" (the card and the push buttons). First answer wins; a later answer
 * gets the existing outcome back. Pausing removes the day's not-yet-finished morning runs and still-due chores
 * for those kids, and notes the bedtime run the night before. */
export async function answerHoliday(
  ctx: MutationCtx,
  p: { skip: Doc<'routineSkips'>; adult: Doc<'members'>; action: 'pause' | 'keep'; now: number },
): Promise<{ message: string; status: Doc<'routineSkips'>['status'] }> {
  if (p.skip.status !== 'asked') return { message: await outcomeMessage(ctx, p.skip), status: p.skip.status };
  const status = p.action === 'pause' ? ('paused' as const) : ('kept' as const);
  await ctx.db.patch(p.skip._id, { status, answeredBy: p.adult._id, answeredAt: p.now });
  if (status === 'paused') await applyPause(ctx, (await ctx.db.get(p.skip._id))!);
  return { message: await outcomeMessage(ctx, (await ctx.db.get(p.skip._id))!), status };
}

async function applyPause(ctx: MutationCtx, skip: Doc<'routineSkips'>): Promise<void> {
  for (const memberId of skip.memberIds) {
    for (const kind of HOLIDAYS.pauses.routines) {
      const runs = await ctx.db
        .query('routineRuns')
        .withIndex('by_family_member_kind_date', (q) => q.eq('familyId', skip.familyId).eq('memberId', memberId).eq('kind', kind).eq('date', skip.date))
        .collect();
      for (const run of runs) if (run.finishedAt === undefined) await ctx.db.delete(run._id);
    }
    if (HOLIDAYS.pauses.chores) {
      const chores = await ctx.db
        .query('chores')
        .withIndex('by_family_for', (q) => q.eq('familyId', skip.familyId).eq('forMemberId', memberId))
        .collect();
      for (const chore of chores) {
        const claims = await ctx.db
          .query('choreClaims')
          .withIndex('by_family_chore_date', (q) => q.eq('familyId', skip.familyId).eq('choreId', chore._id).eq('date', skip.date))
          .collect();
        for (const c of claims) if (c.status === 'due') await ctx.db.delete(c._id);
      }
    }
    const eve = await ctx.db
      .query('routineRuns')
      .withIndex('by_family_member_kind_date', (q) => q.eq('familyId', skip.familyId).eq('memberId', memberId).eq('kind', 'bedtime').eq('date', addDays(skip.date, -1)))
      .first();
    if (eve) await addBedtimeNote(ctx, eve);
  }
}
