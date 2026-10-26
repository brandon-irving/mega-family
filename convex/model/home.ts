// Shared read logic for the home-screen functions (`today.get`, `family.comingUp`, `widgets.timeline`),
// so "what's coming up" and "what am I allowed to see" are computed once, not three times.
import type { Infer } from 'convex/values';
import { LIMITS } from '../../shared/config';
import type { Viewer } from '../../shared/domain/api';
import { listSummary } from '../../shared/domain/api';
import { localDate } from '../../shared/time';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { clock } from '../ports/clock';
import { canSeeScoped } from './visibility';

type Ctx = QueryCtx | MutationCtx;
type ListSummary = Infer<typeof listSummary>;

function viewerPrincipal(viewer: Viewer) {
  return { memberId: viewer.member._id, role: viewer.member.role };
}

function canSeeEvent(viewer: Viewer, event: Doc<'events'>): boolean {
  return canSeeScoped(event.scope, viewerPrincipal(viewer), { ownerId: event.createdBy, who: event.who });
}

/** Events starting in `[from, to]`, visible to `viewer`, ascending by start. Scans from
 * `LIMITS.maxEventHours` before `from` so events already running are included (schema.ts's note on
 * `by_family_start`), then narrows to the real window in memory. */
export async function eventsInRange(ctx: Ctx, viewer: Viewer, from: number, to: number): Promise<Doc<'events'>[]> {
  const scanFrom = from - LIMITS.maxEventHours * 60 * 60_000;
  const rows = await ctx.db
    .query('events')
    .withIndex('by_family_start', (q) => q.eq('familyId', viewer.member.familyId).gte('start', scanFrom).lte('start', to))
    .collect();
  return rows
    .filter((e) => !e.cancelled && e.start <= to && (e.end ?? e.start) >= from && canSeeEvent(viewer, e))
    .sort((a, b) => a.start - b.start);
}

/** `family.comingUp` / `widgets.timeline`'s window: events starting in the next `comingUpWindowMin`. */
export async function upcomingEvents(ctx: Ctx, viewer: Viewer): Promise<Doc<'events'>[]> {
  const now = await clock.now(ctx, viewer.member.familyId);
  return eventsInRange(ctx, viewer, now, now + LIMITS.comingUpWindowMin * 60_000);
}

/** `today.get`'s events: the rest of the viewer's local "today" that hasn't already finished. */
export async function todaysEvents(ctx: Ctx, viewer: Viewer): Promise<Doc<'events'>[]> {
  const now = await clock.now(ctx, viewer.member.familyId);
  const today = localDate(now, viewer.family.timezone);
  const rows = await eventsInRange(ctx, viewer, now - LIMITS.maxEventHours * 60 * 60_000, now + 24 * 60 * 60_000);
  return rows.filter((e) => localDate(e.start, viewer.family.timezone) === today && (e.end ?? e.start) >= now);
}

/** Lists visible to `viewer` (CONTRACT §4 `lists.all`), each with its items and open count. */
export async function visibleLists(ctx: Ctx, viewer: Viewer): Promise<ListSummary[]> {
  const lists = await ctx.db
    .query('lists')
    .withIndex('by_family', (q) => q.eq('familyId', viewer.member.familyId))
    .collect();
  const visible = lists.filter((l) => canSeeScoped(l.scope, viewerPrincipal(viewer), { ownerId: l.ownerId }));
  const out: ListSummary[] = [];
  for (const list of visible) {
    const items = await ctx.db
      .query('listItems')
      .withIndex('by_family_list', (q) => q.eq('familyId', viewer.member.familyId).eq('listId', list._id))
      .collect();
    out.push({ list, open: items.filter((i) => !i.checked).length, items });
  }
  return out;
}

/** The viewer's best live "MEGA statement" (CONTRACT §4 `today.get`/`widgets.timeline`): the highest-scored
 * delivered candidate routed to the widget/Today rather than a push. */
export async function topStatementCandidate(ctx: Ctx, viewer: Viewer): Promise<Doc<'candidates'> | null> {
  const rows = await ctx.db
    .query('candidates')
    .withIndex('by_family_status', (q) => q.eq('familyId', viewer.member.familyId).eq('status', 'delivered'))
    .collect();
  const mine = rows.filter((c) => c.recipientId === viewer.member._id && c.delivery === 'statement');
  if (mine.length === 0) return null;
  return mine.reduce((best, c) => ((c.score ?? 0) > (best.score ?? 0) ? c : best));
}
