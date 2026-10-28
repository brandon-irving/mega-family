// Travel time and "leave by" (G4, CONTRACT v0.15): the view for one event, which events need a traffic check,
// and storing a check (which creates or re-times the leave-by reminder). The Directions call itself lives in
// `convex/travel.ts` (an action).
//
// Invariant 6 (travel follows event visibility): `travelViewFor` re-checks the viewer can see the event; a
// private event's reminder goes to its owner only; a household event's goes to the adults in its `who` (kids
// aren't told to drive). Invariant 7: a failed or unconfigured check stores its `failure`, never minutes.
import { TRAVEL } from '../../shared/config/integrations';
import { leaveByDedupeKey } from '../../shared/config/proactive';
import type { TravelView } from '../../shared/domain/api';
import type { IntegrationFailure } from '../ports/integrationResult';
import { formatLocalTime } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { homePlace, isGeocoded } from './places';
import { finalizeCandidateLogic, insertCandidateIfNew } from './proactive';
import { canSeeEvent, eventOwnerId, layerOf } from './visibility';

type Ctx = QueryCtx | MutationCtx;
const MIN = 60_000;
const HOUR = 60 * MIN;

export async function latestCheck(ctx: Ctx, event: Pick<Doc<'events'>, '_id' | 'familyId'>): Promise<Doc<'travelChecks'> | null> {
  return ctx.db
    .query('travelChecks')
    .withIndex('by_family_event_checked', (q) => q.eq('familyId', event.familyId).eq('eventId', event._id))
    .order('desc')
    .first();
}

/** `travel.forEvent`: NOT_FOUND unless the viewer can see the event (a private one: its owner only). */
export async function travelViewFor(ctx: Ctx, viewer: { memberId: Id<'members'>; role: Doc<'members'>['role']; familyId: Id<'families'> }, eventId: Id<'events'>): Promise<TravelView | null> {
  const event = await ctx.db.get(eventId);
  if (!event || event.familyId !== viewer.familyId || !canSeeEvent(viewer, event)) fail('NOT_FOUND');
  const empty = { eventId, from: null, to: null, minutes: null, typicalMinutes: null, leaveBy: null, checkedAt: null };
  const to = event.placeId ? await ctx.db.get(event.placeId) : null;
  const home = await homePlace(ctx, event.familyId);
  if (!to || !isGeocoded(to) || !home || !isGeocoded(home)) return { ...empty, failure: 'noPlace' };
  const check = await latestCheck(ctx, event);
  if (!check) return null;
  const from = await ctx.db.get(check.fromPlaceId);
  const toPlace = await ctx.db.get(check.toPlaceId);
  return {
    eventId,
    from: from ? { placeId: from._id, label: from.label } : null,
    to: toPlace ? { placeId: toPlace._id, label: toPlace.label } : null,
    minutes: check.failure ? null : (check.minutes ?? null),
    typicalMinutes: check.failure ? null : (check.typicalMinutes ?? null),
    leaveBy: check.failure ? null : (check.leaveBy ?? null),
    checkedAt: check.checkedAt,
    ...(check.failure ? { failure: check.failure } : {}),
  };
}

export type CheckTarget = { eventId: Id<'events'>; from: { placeId: Id<'places'>; lat: number; lng: number }; to: { placeId: Id<'places'>; lat: number; lng: number }; departAt: number | 'now' };

/** Events starting within TRAVEL.lookaheadHours at a geocoded place (not home itself), whose last check is
 * older than TRAVEL.recheckMinutes (or always, with `force`). Origin is the family's home (TRAVEL.defaultFrom). */
export async function checkTargets(ctx: Ctx, familyId: Id<'families'>, now: number, force: boolean): Promise<CheckTarget[]> {
  const home = await homePlace(ctx, familyId);
  if (!home || !isGeocoded(home)) return [];
  const events = await ctx.db
    .query('events')
    .withIndex('by_family_start', (q) => q.eq('familyId', familyId).gt('start', now).lte('start', now + TRAVEL.lookaheadHours * HOUR))
    .collect();
  const targets: CheckTarget[] = [];
  for (const e of events) {
    if (e.cancelled || e.allDay || !e.placeId || e.placeId === home._id) continue;
    const to = await ctx.db.get(e.placeId);
    if (!to || !isGeocoded(to)) continue;
    const last = await latestCheck(ctx, e);
    if (!force && last && last.checkedAt + TRAVEL.recheckMinutes * MIN > now) continue;
    const estimate = last?.minutes ?? TRAVEL.firstEstimateMinutes;
    const depart = e.start - estimate * MIN;
    targets.push({ eventId: e._id, from: { placeId: home._id, lat: home.lat, lng: home.lng }, to: { placeId: to._id, lat: to.lat, lng: to.lng }, departAt: depart > now ? depart : 'now' });
  }
  return targets;
}

/** Who gets the leave-by reminder (invariant 6). */
async function leaveByRecipients(ctx: MutationCtx, event: Doc<'events'>): Promise<Id<'members'>[]> {
  const ids = layerOf(event) === 'private' ? [eventOwnerId(event)].filter((x): x is Id<'members'> => !!x) : event.who;
  const out: Id<'members'>[] = [];
  for (const id of new Set(ids)) {
    const member = await ctx.db.get(id);
    if (member && member.familyId === event.familyId && member.role !== 'kid' && member.authId) out.push(id);
  }
  return out;
}

export type CheckResult = { ok: true; minutes: number; typicalMinutes?: number; distanceMeters: number } | { ok: false; failure: IntegrationFailure };

/** Stores a check and creates (or re-times) the leave-by reminder for each recipient. */
export async function storeCheck(ctx: MutationCtx, p: { target: CheckTarget; departAt: number; result: CheckResult; now: number }): Promise<void> {
  const event = await ctx.db.get(p.target.eventId);
  if (!event || event.cancelled) return;
  const family = await ctx.db.get(event.familyId);
  if (!family) return;
  const leaveBy = p.result.ok ? event.start - p.result.minutes * MIN - TRAVEL.leaveByBufferMinutes * MIN : undefined;
  const checkId = await ctx.db.insert('travelChecks', {
    familyId: event.familyId,
    eventId: event._id,
    fromPlaceId: p.target.from.placeId,
    toPlaceId: p.target.to.placeId,
    departAt: p.departAt,
    ...(p.result.ok ? { minutes: p.result.minutes, typicalMinutes: p.result.typicalMinutes, distanceMeters: p.result.distanceMeters, leaveBy } : { failure: p.result.failure }),
    checkedAt: p.now,
  });
  if (!p.result.ok || leaveBy === undefined || p.result.minutes < TRAVEL.minTripMinutes) return;

  const to = await ctx.db.get(p.target.to.placeId);
  const time = formatLocalTime(leaveBy, family.timezone);
  const usually = p.result.typicalMinutes && p.result.typicalMinutes !== p.result.minutes ? ` (usually ${p.result.typicalMinutes})` : '';
  const title = `Leave by ${time} for ${event.title}`;
  const text = `${p.result.minutes} min to ${to?.label ?? 'there'} with traffic${usually}. Leave by ${time}.`;
  const window = { from: leaveBy - TRAVEL.remindBeforeMinutes * MIN, to: event.start };
  const source = { kind: 'leaveBy' as const, eventId: event._id, checkId };

  for (const recipientId of await leaveByRecipients(ctx, event)) {
    const dedupeKey = leaveByDedupeKey(event._id, recipientId);
    const existing = await ctx.db
      .query('candidates')
      .withIndex('by_family_dedupeKey', (q) => q.eq('familyId', event.familyId).eq('dedupeKey', dedupeKey))
      .first();
    let candidateId: Id<'candidates'> | null;
    if (!existing) {
      candidateId = await insertCandidateIfNew(ctx, { familyId: event.familyId, recipientId, kind: 'reminder', dedupeKey, draftText: text, window, source });
    } else if (existing.status === 'new' || existing.status === 'scheduled') {
      // A newer traffic check: re-time the same reminder rather than adding a second one.
      if (existing.scheduledId) await ctx.scheduler.cancel(existing.scheduledId);
      await ctx.db.patch(existing._id, { status: 'new', source, window, draft: { ...existing.draft, text }, scheduledId: undefined, deliverAt: undefined });
      candidateId = existing._id;
    } else continue; // already delivered (or dropped/cancelled): don't remind twice
    if (candidateId) await finalizeCandidateLogic(ctx, { candidateId, kind: 'reminder', title, text, score: 1, reason: 'leave-by from a traffic check', forcedDelivery: 'push' });
  }
}
