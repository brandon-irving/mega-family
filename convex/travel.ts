// CONTRACT §4 `travel.forEvent` (G4, v0.15) and the leave-by sweep. The sweep runs on the integrations cron:
// for each family, events within TRAVEL.lookaheadHours at a saved place get a Directions check (Mapbox
// driving-traffic, from home) at most every TRAVEL.recheckMinutes; each check is stored and re-times that
// event's leave-by reminder (convex/model/travel.ts). Without MAPBOX_TOKEN the check stores `not_configured`.
import { v } from 'convex/values';
import { API } from '../shared/domain/api';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { getDirections } from './adapters/registry';
import { integrationFailure } from '../shared/domain/tables';
import { pick } from './model/define';
import { fail } from './model/errors';
import { answerTravel, checkTargets, storeCheck, travelViewFor } from './model/travel';
import { canSeeEvent } from './model/visibility';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const forEvent = query({
  ...pick(API.travel.forEvent),
  handler: async (ctx, { eventId }) => {
    const viewer = await requireViewer(ctx);
    return travelViewFor(ctx, { memberId: viewer.member._id, role: viewer.member.role, familyId: viewer.member.familyId }, eventId);
  },
});

export const answer = mutation({
  ...pick(API.travel.answer),
  handler: async (ctx, { travelCheckId, action }) => {
    const viewer = await requireViewer(ctx);
    const check = await ctx.db.get(travelCheckId);
    if (!check || check.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const event = await ctx.db.get(check.eventId);
    if (!event || !canSeeEvent({ memberId: viewer.member._id, role: viewer.member.role }, event)) fail('NOT_FOUND');
    return answerTravel(ctx, { event, memberId: viewer.member._id, action, now: await clock.now(ctx, viewer.member.familyId), tz: viewer.family.timezone });
  },
});

const point = v.object({ placeId: v.id('places'), lat: v.number(), lng: v.number() });
const target = v.object({ eventId: v.id('events'), from: point, to: point, departAt: v.union(v.number(), v.literal('now')) });

export const targets = internalQuery({
  args: { familyId: v.id('families'), force: v.boolean() },
  returns: v.object({ now: v.number(), targets: v.array(target) }),
  handler: async (ctx, { familyId, force }) => {
    const now = await clock.now(ctx, familyId);
    return { now, targets: await checkTargets(ctx, familyId, now, force) };
  },
});

export const store = internalMutation({
  args: {
    target,
    departAt: v.number(),
    result: v.union(
      v.object({ ok: v.literal(true), minutes: v.number(), typicalMinutes: v.optional(v.number()), distanceMeters: v.number() }),
      v.object({ ok: v.literal(false), failure: integrationFailure }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.target.eventId);
    if (!event) return null;
    await storeCheck(ctx, { target: args.target, departAt: args.departAt, result: args.result, now: await clock.now(ctx, event.familyId) });
    return null;
  },
});

/** One family's leave-by checks (the integrations cron calls it per family; tests call it directly). */
export const checkFamily = internalAction({
  args: { familyId: v.id('families'), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { familyId, force }) => {
    const { now, targets } = await ctx.runQuery(internal.travel.targets, { familyId, force: !!force });
    const directions = getDirections();
    for (const t of targets) {
      const r = await directions.travelTime({ from: t.from, to: t.to, departAt: t.departAt });
      await ctx.runMutation(internal.travel.store, {
        target: t,
        departAt: t.departAt === 'now' ? now : t.departAt,
        result: r.ok ? { ok: true, minutes: r.minutes, typicalMinutes: r.typicalMinutes, distanceMeters: r.distanceMeters } : { ok: false, failure: r.failure },
      });
    }
    return null;
  },
});

export const checkAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const familyId of await ctx.runQuery(internal.weather.familyIds, {})) await ctx.scheduler.runAfter(0, internal.travel.checkFamily, { familyId });
    return null;
  },
});
