// The agent's network tools (G4): `web_search`, `weather` and `travel_time`. They can't run in
// `agent/tools.ts`'s dispatcher (a mutation can't call out), so the loop (an action) routes them here. Each
// re-checks the role gate server-side, reads only what the caller may see, posts its card in the caller's own
// thread, and returns the tool result text. Provider failures fail closed with INTEGRATION_COPY wording.
import { v } from 'convex/values';
import { INTEGRATION_COPY, TRAVEL } from '../../shared/config/integrations';
import { formatLocalTime, localDateTimeToInstant } from '../../shared/time';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type ActionCtx } from '../_generated/server';
import { getDirections } from '../adapters/registry';
import { homePlace, isGeocoded, placeByLabel } from '../model/places';
import { postCard } from '../model/proactive';
import { canSeeEvent } from '../model/visibility';
import { buildWeatherView, weatherSentence } from '../model/weather';
import { clock } from '../ports/clock';
import { isToolAllowedForRole } from './toolSpecs';

const MIN = 60_000;
export const NET_TOOL_NAMES = new Set(['web_search', 'weather', 'travel_time']);

/** Whether the loop should offer `web_search` to this member (a kid's `kidControls.webSearch` can turn it off). */
export const toolGate = internalQuery({
  args: { familyId: v.id('families'), memberId: v.id('members') },
  returns: v.object({ webSearchOff: v.boolean() }),
  handler: async (ctx, { familyId, memberId }) => {
    const kc = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', memberId))
      .unique();
    return { webSearchOff: kc ? !kc.webSearch : false };
  },
});

// ---------- weather ----------

export const weatherPlace = internalQuery({
  args: { familyId: v.id('families'), label: v.optional(v.string()) },
  returns: v.union(v.object({ placeId: v.id('places'), geocoded: v.boolean() }), v.null()),
  handler: async (ctx, { familyId, label }) => {
    const place = label?.trim() ? await placeByLabel(ctx, familyId, label) : await homePlace(ctx, familyId);
    return place ? { placeId: place._id, geocoded: isGeocoded(place) } : null;
  },
});

export const weatherViewFor = internalQuery({
  args: { familyId: v.id('families'), placeId: v.id('places') },
  returns: v.any(),
  handler: async (ctx, { familyId, placeId }) => {
    const place = await ctx.db.get(placeId);
    const family = await ctx.db.get(familyId);
    if (!place || !family || place.familyId !== familyId) return null;
    return buildWeatherView(ctx, place, family.timezone, await clock.now(ctx, familyId));
  },
});

export const postWeatherCard = internalMutation({
  args: { familyId: v.id('families'), memberId: v.id('members'), megaId: v.optional(v.id('megas')), view: v.any(), summary: v.string() },
  returns: v.null(),
  handler: async (ctx, { familyId, memberId, megaId, view, summary }) => {
    const now = await clock.now(ctx, familyId);
    const a = view.alerts?.[0];
    await postCard(ctx, {
      familyId,
      recipientId: memberId,
      megaId,
      now,
      card: {
        kind: 'weather',
        summary,
        at: now,
        placeLabel: view.placeLabel,
        hours: view.hours,
        ...(view.today ? { highF: view.today.highF, lowF: view.today.lowF } : {}),
        ...(a ? { alert: { event: a.event, headline: a.headline, severity: a.severity, ends: a.ends } } : {}),
      },
    });
    return null;
  },
});

async function weatherTool(ctx: ActionCtx, a: { familyId: Id<'families'>; memberId: Id<'members'>; megaId?: Id<'megas'> }, raw: Record<string, unknown>): Promise<string> {
  const target = await ctx.runQuery(internal.agent.netTools.weatherPlace, { familyId: a.familyId, label: typeof raw.place === 'string' ? raw.place : undefined });
  if (!target || !target.geocoded) return INTEGRATION_COPY.noPlace;
  const { targets } = await ctx.runQuery(internal.weather.pollTargets, { familyId: a.familyId, placeId: target.placeId, force: false });
  if (targets.length) await ctx.runAction(internal.weather.fetchPlace, { placeId: target.placeId });
  const view = await ctx.runQuery(internal.agent.netTools.weatherViewFor, { familyId: a.familyId, placeId: target.placeId });
  const sentence = view ? weatherSentence(view) : '';
  if (!sentence) return INTEGRATION_COPY.weatherUnavailable;
  await ctx.runMutation(internal.agent.netTools.postWeatherCard, { familyId: a.familyId, memberId: a.memberId, megaId: a.megaId, view, summary: sentence });
  return `A weather card is already in the chat. Weather (use only these numbers): ${sentence}`;
}

// ---------- travel ----------

const tripPoint = v.object({ placeId: v.id('places'), label: v.string(), lat: v.number(), lng: v.number() });

/** Resolves a trip for the caller: `to` is a saved place or an upcoming event the caller can see (its saved
 * place); `from` defaults to home. Private events stay invisible to everyone but their owner. */
export const resolveTrip = internalQuery({
  args: { familyId: v.id('families'), memberId: v.id('members'), to: v.string(), from: v.optional(v.string()) },
  returns: v.union(v.object({ from: tripPoint, to: tripPoint, event: v.union(v.object({ eventId: v.id('events'), start: v.number(), title: v.string() }), v.null()), tz: v.string(), now: v.number() }), v.null()),
  handler: async (ctx, { familyId, memberId, to, from }) => {
    const member = await ctx.db.get(memberId);
    const family = await ctx.db.get(familyId);
    if (!member || !family || member.familyId !== familyId) return null;
    const now = await clock.now(ctx, familyId);
    const point = (p: Doc<'places'> | null) => (p && isGeocoded(p) ? { placeId: p._id, label: p.label, lat: p.lat, lng: p.lng } : null);

    let toPlace = await placeByLabel(ctx, familyId, to);
    let event: { eventId: Id<'events'>; start: number; title: string } | null = null;
    if (!toPlace) {
      const want = to.trim().toLowerCase();
      const upcoming = await ctx.db
        .query('events')
        .withIndex('by_family_start', (q) => q.eq('familyId', familyId).gte('start', now).lte('start', now + 7 * 24 * 60 * MIN))
        .collect();
      const e = upcoming.find((x) => !x.cancelled && x.placeId && x.title.toLowerCase().includes(want) && canSeeEvent({ memberId, role: member.role }, x));
      if (e?.placeId) {
        toPlace = await ctx.db.get(e.placeId);
        event = { eventId: e._id, start: e.start, title: e.title };
      }
    }
    const fromPlace = from?.trim() ? await placeByLabel(ctx, familyId, from) : await homePlace(ctx, familyId);
    const f = point(fromPlace);
    const t = point(toPlace);
    if (!f || !t) return null;
    return { from: f, to: t, event, tz: family.timezone, now };
  },
});

export const postTravelCard = internalMutation({
  args: {
    familyId: v.id('families'),
    memberId: v.id('members'),
    megaId: v.optional(v.id('megas')),
    to: v.string(),
    fromLabel: v.string(),
    eventId: v.optional(v.id('events')),
    minutes: v.number(),
    typicalMinutes: v.optional(v.number()),
    leaveBy: v.number(),
    failure: v.optional(v.union(v.literal('not_configured'), v.literal('no_result'), v.literal('rate_limited'), v.literal('error'))),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const now = await clock.now(ctx, a.familyId);
    await postCard(ctx, {
      familyId: a.familyId,
      recipientId: a.memberId,
      megaId: a.megaId,
      now,
      card: { kind: 'travel', to: a.to, leaveBy: a.leaveBy, minutes: a.minutes, eventId: a.eventId, fromLabel: a.fromLabel, typicalMinutes: a.typicalMinutes, ...(a.failure ? { failure: a.failure } : {}) },
    });
    return null;
  },
});

async function travelTool(ctx: ActionCtx, a: { familyId: Id<'families'>; memberId: Id<'members'>; megaId?: Id<'megas'> }, raw: Record<string, unknown>): Promise<string> {
  if (typeof raw.to !== 'string' || !raw.to.trim()) return 'travel_time needs "to": a saved place or an upcoming event';
  const trip = await ctx.runQuery(internal.agent.netTools.resolveTrip, { familyId: a.familyId, memberId: a.memberId, to: raw.to, from: typeof raw.from === 'string' ? raw.from : undefined });
  if (!trip) return INTEGRATION_COPY.noPlace;
  let departAt: number | 'now' = 'now';
  if (typeof raw.departAt === 'string' && raw.departAt.trim()) departAt = localDateTimeToInstant(raw.departAt, trip.tz);
  else if (trip.event) departAt = trip.event.start - TRAVEL.firstEstimateMinutes * MIN;
  if (departAt !== 'now' && departAt <= trip.now) departAt = 'now';

  const r = await getDirections().travelTime({ from: trip.from, to: trip.to, departAt });
  const base = { familyId: a.familyId, memberId: a.memberId, megaId: a.megaId, to: trip.to.label, fromLabel: trip.from.label, eventId: trip.event?.eventId };
  if (!r.ok) {
    // Fail closed: the card carries the failure and zeros the app never shows as a time (CONTRACT §3 travel).
    await ctx.runMutation(internal.agent.netTools.postTravelCard, { ...base, minutes: 0, leaveBy: 0, failure: r.failure });
    return r.failure === 'not_configured' ? INTEGRATION_COPY.travelNotConfigured : "I couldn't get a route there right now.";
  }
  const leaveBy = trip.event ? trip.event.start - r.minutes * MIN - TRAVEL.leaveByBufferMinutes * MIN : 0;
  await ctx.runMutation(internal.agent.netTools.postTravelCard, { ...base, minutes: r.minutes, typicalMinutes: r.typicalMinutes, leaveBy });
  const usually = r.typicalMinutes && r.typicalMinutes !== r.minutes ? ` (usually ${r.typicalMinutes})` : '';
  return `A travel card is already in the chat. ${r.minutes} min from ${trip.from.label} to ${trip.to.label} with traffic${usually}.${trip.event ? ` To make ${trip.event.title}, leave by ${formatLocalTime(leaveBy, trip.tz)}.` : ''}`;
}

// ---------- dispatcher ----------

export const run = internalAction({
  args: { familyId: v.id('families'), memberId: v.id('members'), role: v.string(), megaId: v.optional(v.id('megas')), name: v.string(), argumentsJson: v.string() },
  returns: v.object({ ok: v.boolean(), resultText: v.string() }),
  handler: async (ctx, args): Promise<{ ok: boolean; resultText: string }> => {
    if (!isToolAllowedForRole(args.name, args.role as Doc<'members'>['role'])) return { ok: false, resultText: `the "${args.name}" tool isn't available to you` };
    let raw: Record<string, unknown>;
    try {
      const parsed = JSON.parse(args.argumentsJson);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      raw = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, resultText: 'invalid tool arguments (not valid JSON)' };
    }
    const who = { familyId: args.familyId, memberId: args.memberId, megaId: args.megaId };
    switch (args.name) {
      case 'web_search':
        return ctx.runAction(internal.search.run, { ...who, query: typeof raw.query === 'string' ? raw.query : '' });
      case 'weather':
        return { ok: true, resultText: await weatherTool(ctx, who, raw) };
      case 'travel_time':
        return { ok: true, resultText: await travelTool(ctx, who, raw) };
      default:
        return { ok: false, resultText: `unknown tool "${args.name}"` };
    }
  },
});
