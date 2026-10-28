// GD (CONTRACT v0.13): Hub's clash checker. It reads HOUSEHOLD-layer events only — `householdEventsInWindow`
// is the single read, and it filters on the stored scope before anything else sees a row — so a private
// event can never become a collision, a proposal or a notification (invariant 3, the negative control).
// Finding the fix and wording it are model calls (convex/clashes.ts); this file is the deterministic part.
import { CLASH } from '../../shared/config/calendar';
import { clashDedupeKey } from '../../shared/config/proactive';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { layerOf } from './visibility';

type Ctx = QueryCtx | MutationCtx;
const MINUTE = 60_000;

/** Household-layer, not-cancelled events that are still going at `from` or start by `to`. The ONLY event
 * read the clash checker makes. Private (`personal`) and grant (`shared`) events are dropped here, before
 * any other logic. An event already in progress counts (GD review): the index reads back
 * `CLASH.maxEventHours` before `from`, and anything that ended by `from` is dropped. */
export async function householdEventsInWindow(ctx: Ctx, familyId: Id<'families'>, from: number, to: number): Promise<Doc<'events'>[]> {
  const rows = await ctx.db
    .query('events')
    .withIndex('by_family_start', (q) => q.eq('familyId', familyId).gte('start', from - CLASH.maxEventHours * 60 * MINUTE).lte('start', to))
    .collect();
  return rows.filter((e) => layerOf(e) === 'household' && !e.cancelled && (e.start >= from || (endOf(e) ?? e.start) > from));
}

export interface Clash {
  eventIds: [Id<'events'>, Id<'events'>];
  memberId: Id<'members'>;
  dedupeKey: string;
  fingerprint: string;
}

type Timing = Pick<Doc<'events'>, 'start' | 'end'> & { allDay?: string };

/** An event's end. New all-day events store the end of their local day (model/eventWrites.ts
 * `eventEnd`); an older all-day row without one is treated as lasting a day from its start. */
export function endOf(e: Timing): number | undefined {
  if (e.end !== undefined) return e.end;
  return e.allDay ? e.start + 24 * 60 * MINUTE : undefined;
}

/** Overlap in ms of two events' [start, end) — a timed event with no end is a moment and overlaps nothing. */
export function overlapMs(a: Timing, b: Timing): number {
  const aEnd = endOf(a);
  const bEnd = endOf(b);
  if (aEnd === undefined || bEnd === undefined) return 0;
  return Math.min(aEnd, bEnd) - Math.max(a.start, b.start);
}

/** What a decision about a clash was made on: both events' timing and people. A dismissed or resolved
 * clash is only raised again once this changes, so a sweep never re-asks about the same thing. */
export function clashFingerprint(a: Timing & Pick<Doc<'events'>, 'who'>, b: Timing & Pick<Doc<'events'>, 'who'>): string {
  const one = (e: Timing & Pick<Doc<'events'>, 'who'>) => `${e.start}-${endOf(e) ?? ''}-${[...e.who].sort().join('.')}`;
  return `${one(a)}|${one(b)}`;
}

/** Pure: every pair of household events that overlap by at least `CLASH.minOverlapMinutes` and need the
 * same person. Callers pass household events only. */
export function findClashes(events: Doc<'events'>[]): Clash[] {
  const out: Clash[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (layerOf(a) !== 'household' || layerOf(b) !== 'household') continue; // defense in depth
      if (overlapMs(a, b) < CLASH.minOverlapMinutes * MINUTE) continue;
      for (const memberId of a.who) {
        if (!b.who.includes(memberId)) continue;
        const [first, second] = a._id < b._id ? [a, b] : [b, a];
        const ids: [Id<'events'>, Id<'events'>] = [first._id, second._id];
        out.push({ eventIds: ids, memberId, dedupeKey: clashDedupeKey(ids, memberId), fingerprint: clashFingerprint(first, second) });
      }
    }
  }
  return out;
}

/** Runs on every household calendar change and on the sweep: records new clashes (deduped) and asks Hub to
 * propose a fix for each; marks open clashes that no longer overlap as stale (and their pending proposal). */
export async function detectClashes(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<Id<'collisions'>[]> {
  const events = await householdEventsInWindow(ctx, familyId, now, now + CLASH.lookaheadDays * 24 * 60 * MINUTE);
  const clashes = findClashes(events);
  const live = new Set(clashes.map((c) => c.dedupeKey));

  const open = await ctx.db
    .query('collisions')
    .withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'open'))
    .collect();
  for (const c of open) {
    const [a, b] = await Promise.all(c.eventIds.map((id) => ctx.db.get(id)));
    const stillClashes = live.has(c.dedupeKey) || (!!a && !!b && layerOf(a) === 'household' && layerOf(b) === 'household' && !a.cancelled && !b.cancelled && overlapMs(a, b) >= CLASH.minOverlapMinutes * MINUTE && a.who.includes(c.memberId) && b.who.includes(c.memberId));
    if (stillClashes) continue;
    await ctx.db.patch(c._id, { status: 'stale' });
    const proposals = await ctx.db
      .query('proposals')
      .withIndex('by_family_collision', (q) => q.eq('familyId', familyId).eq('collisionId', c._id))
      .collect();
    for (const p of proposals) if (p.status === 'pending') await ctx.db.patch(p._id, { status: 'stale' });
  }

  const created: Id<'collisions'>[] = [];
  for (const clash of clashes) {
    // GD review: only an OPEN row, or a decision (dismissed/resolved) made on these exact events, holds a
    // pair back. A pair that went stale and clashes again, or was decided and then edited into a new
    // clash, is raised again.
    const latest = await ctx.db
      .query('collisions')
      .withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId).eq('dedupeKey', clash.dedupeKey))
      .order('desc')
      .first();
    if (latest?.status === 'open') continue;
    if (latest && (latest.status === 'dismissed' || latest.status === 'resolved') && latest.fingerprint === clash.fingerprint) continue;
    const collisionId = await ctx.db.insert('collisions', { familyId, eventIds: clash.eventIds, memberId: clash.memberId, dedupeKey: clash.dedupeKey, fingerprint: clash.fingerprint, detectedAt: now, status: 'open' });
    created.push(collisionId);
    await ctx.scheduler.runAfter(0, internal.clashes.propose, { collisionId });
  }
  return created;
}
