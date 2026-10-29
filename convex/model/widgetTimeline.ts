// G8 `widgets.next` (CONTRACT v0.18 §6, docs/gates/G8.md backend task 1): the home- and lock-screen widget's
// timeline, planned on the server because the widget runtime can't fetch. `planEntries` is pure (the rule and
// its edges are unit-tested without a database); `buildWidgetTimeline` loads what the viewer may see and hands
// it over. Visibility is the app's: an adult gets what `canSeeEvent` allows, a kid only events they're in or
// that are for the whole family (no one listed). Nothing here calls a model.
import { WIDGET_TIMELINE } from '../../shared/config/widgets';
import { PERSONALITIES } from '../../shared/config';
import { LINKS } from '../../shared/domain/api';
import type { Viewer, WidgetNextEntry, WidgetSoonItem, WidgetTimeline } from '../../shared/domain/api';
import { formatLocalTime } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { clock } from '../ports/clock';
import { eventsInRange, topStatementCandidate } from './home';
import { eventOwnerId, layerOf } from './visibility';

const MIN = 60_000;
const NO_MEGA_HEX = '#9AA1AB';

type Cfg = Pick<typeof WIDGET_TIMELINE, 'soonWindowMinutes' | 'startedGraceMinutes' | 'maxSoon' | 'horizonHours' | 'maxEntries' | 'shortStatementChars'>;
export type PlanEvent = WidgetSoonItem & { id: string };

/** "Short" statement text for the small and lock widgets: whole words up to `max` chars, then "…". */
export function shortText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** The events "coming up" at instant `t`: started less than the grace ago, or starting within the window. */
function soonAt(events: PlanEvent[], t: number, cfg: Cfg): PlanEvent[] {
  return events
    .filter((e) => e.startsAt > t - cfg.startedGraceMinutes * MIN && e.startsAt <= t + cfg.soonWindowMinutes * MIN)
    .slice(0, cfg.maxSoon);
}

const sameEntry = (a: WidgetNextEntry, b: WidgetNextEntry) => JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 });

/**
 * Entries in time order: the first at `now`, a new one whenever what the widget shows changes (an event enters
 * the window at `start − soonWindow`, or leaves at `start + startedGrace`), `maxSoon` items each; with nothing
 * soon, the viewer's statement or "empty". Stops at `horizonHours` or `maxEntries − 1` and ends with one `stale`
 * entry, so after the plan runs out the widget says to open MEGA instead of showing something old as current.
 * A plan that is only "empty" (nothing planned, nothing to say) stays a single empty entry.
 */
export function planEntries(input: { now: number; events: PlanEvent[]; statement: string | null }, cfg: Cfg = WIDGET_TIMELINE): WidgetNextEntry[] {
  const { now, statement } = input;
  const events = [...input.events].sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title));
  const horizonEnd = now + cfg.horizonHours * 60 * MIN;
  const idle: WidgetNextEntry = statement
    ? { at: now, kind: 'statement', statement: { text: statement, short: shortText(statement, cfg.shortStatementChars) }, link: LINKS.chat() }
    : { at: now, kind: 'empty', link: LINKS.today() };

  const entryAt = (t: number): WidgetNextEntry => {
    const soon = soonAt(events, t, cfg);
    if (soon.length === 0) return { ...idle, at: t };
    return { at: t, kind: 'soon', soon: soon.map(({ id: _id, ...item }) => item), link: LINKS.today() };
  };

  const breaks = new Set<number>();
  for (const e of events) {
    for (const b of [e.startsAt - cfg.soonWindowMinutes * MIN, e.startsAt + cfg.startedGraceMinutes * MIN]) if (b > now && b <= horizonEnd) breaks.add(b);
  }
  const times = [now, ...[...breaks].sort((a, b) => a - b)];

  const out: WidgetNextEntry[] = [];
  for (const t of times) {
    const entry = entryAt(t);
    if (out.length > 0 && sameEntry(entry, out[out.length - 1])) continue;
    if (out.length === cfg.maxEntries - 1) {
      out.push({ at: t, kind: 'stale', link: LINKS.today() });
      return out;
    }
    out.push(entry);
  }
  if (out.length === 1 && out[0].kind === 'empty' && events.length === 0) return out;
  if (out[out.length - 1].at < horizonEnd) out.push({ at: horizonEnd, kind: 'stale', link: LINKS.today() });
  return out;
}

/** Can this viewer see this event on their widget? The app's rule, plus: a kid only sees events they're in or
 * the whole family's (no one listed). Never another member's private-layer event, even with the viewer in `who`. */
function onWidget(viewer: Viewer, event: Doc<'events'>): boolean {
  if (layerOf(event) === 'private' && eventOwnerId(event) !== viewer.member._id) return false;
  if (viewer.member.role !== 'kid') return true;
  return event.who.length === 0 || event.who.includes(viewer.member._id);
}

export async function buildWidgetTimeline(ctx: QueryCtx, viewer: Viewer): Promise<WidgetTimeline> {
  const familyId = viewer.member.familyId;
  const tz = viewer.family.timezone;
  const now = await clock.now(ctx, familyId);
  const cfg = WIDGET_TIMELINE;
  const from = now - cfg.startedGraceMinutes * MIN;
  const to = now + (cfg.horizonHours * 60 + cfg.soonWindowMinutes) * MIN;
  const rows = (await eventsInRange(ctx, viewer, from, to)).filter((e) => e.start > from && onWidget(viewer, e));

  const whoCache = new Map<Id<'members'>, { name: string; hex: string } | null>();
  const whoOf = async (memberId: Id<'members'>) => {
    if (!whoCache.has(memberId)) {
      const member = await ctx.db.get(memberId);
      const mega = member
        ? await ctx.db
            .query('megas')
            .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId))
            .unique()
        : null;
      whoCache.set(memberId, member && member.familyId === familyId ? { name: member.name, hex: mega?.look.hex ?? NO_MEGA_HEX } : null);
    }
    return whoCache.get(memberId) ?? null;
  };

  const events: PlanEvent[] = [];
  for (const e of rows) {
    const who = [];
    for (const memberId of e.who) {
      const w = await whoOf(memberId);
      if (w) who.push(w);
    }
    events.push({
      id: e._id,
      title: e.title,
      startsAt: e.start,
      timeLabel: formatLocalTime(e.start, tz),
      who,
      private: layerOf(e) === 'private' && eventOwnerId(e) === viewer.member._id,
    });
  }

  const statement = await topStatementCandidate(ctx, viewer);
  const mega = viewer.mega
    ? { name: viewer.mega.name, hex: viewer.mega.look.hex, sticker: viewer.mega.look.sticker, face: PERSONALITIES[viewer.mega.personality].face }
    : { name: 'MEGA', hex: NO_MEGA_HEX, sticker: 'none' as const, face: 'calm' as const };

  return {
    generatedAt: now,
    mega,
    kid: viewer.member.role === 'kid',
    entries: planEntries({ now, events, statement: statement?.draft.text ?? null }, cfg),
    talkLink: LINKS.talk(),
  };
}
