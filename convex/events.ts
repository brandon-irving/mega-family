// CONTRACT §4 `events.create` / `.update` / `.cancel` / `.share` / `.unshare`.
//
// GD (v0.13): a `personal` event lives on its owner's private layer — `ownerId` is set on create, nobody else
// can see it (convex/model/visibility.ts `canSeeEvent`) or change it, and only the owner's own `share` moves
// it to the household layer (convex/model/layers.ts). Every write re-runs Hub's clash check.
import { API } from '../shared/domain/api';
import type { Id } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { calendarChanged, eventEnd, patchEvent } from './model/eventWrites';
import { maybeSuggestEventShare, notifyParentsOfTeenEvent, shareItem, unshareEvent } from './model/layers';
import { requireFamilyPlace } from './model/places';
import { requireViewer, sameFamilyMember } from './model/viewer';
import { canSeeEvent } from './model/visibility';
import { clock } from './ports/clock';

export const create = mutation({
  ...pick(API.events.create),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    for (const id of args.who) await sameFamilyMember(ctx, viewer.member.familyId, id);
    if (args.placeId) await requireFamilyPlace(ctx, viewer.member.familyId, args.placeId);
    const now = await clock.now(ctx, viewer.member.familyId);
    const eventId = await ctx.db.insert('events', {
      familyId: viewer.member.familyId,
      title: args.title,
      start: args.start,
      end: eventEnd(args.end, args.allDay, viewer.family.timezone),
      allDay: args.allDay,
      who: args.who,
      place: args.place,
      placeId: args.placeId,
      source: 'mega',
      createdBy: viewer.member._id,
      scope: args.scope,
      cancelled: false,
      ownerId: args.scope === 'personal' ? viewer.member._id : undefined,
    });
    const event = (await ctx.db.get(eventId))!;
    if (args.scope === 'personal') await maybeSuggestEventShare(ctx, event, viewer.family.timezone, now);
    else { await calendarChanged(ctx, viewer.member.familyId, now); await notifyParentsOfTeenEvent(ctx, event, now); }
    return eventId;
  },
});

/** The caller's own event, or (for the admin) any event they can see. A private event someone else owns is
 * NOT_FOUND — not even its existence is revealed. */
async function loadEditable(ctx: MutationCtx, eventId: Id<'events'>) {
  const viewer = await requireViewer(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.familyId !== viewer.member.familyId) fail('NOT_FOUND');
  if (!canSeeEvent({ memberId: viewer.member._id, role: viewer.member.role }, event)) fail('NOT_FOUND');
  if (event.createdBy !== viewer.member._id && event.ownerId !== viewer.member._id && viewer.member.role !== 'admin') fail('FORBIDDEN');
  return { viewer, event };
}

export const update = mutation({
  ...pick(API.events.update),
  handler: async (ctx, args) => {
    const { viewer, event } = await loadEditable(ctx, args.eventId);
    const now = await clock.now(ctx, viewer.member.familyId);
    await patchEvent(ctx, event, args.patch, now);
    return null;
  },
});

export const cancel = mutation({
  ...pick(API.events.cancel),
  handler: async (ctx, args) => {
    const { viewer, event } = await loadEditable(ctx, args.eventId);
    await ctx.db.patch(event._id, { cancelled: true });
    await calendarChanged(ctx, viewer.member.familyId, await clock.now(ctx, viewer.member.familyId));
    return null;
  },
});

export const share = mutation({
  ...pick(API.events.share),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (!canSeeEvent({ memberId: viewer.member._id, role: viewer.member.role }, event)) fail('NOT_FOUND');
    const now = await clock.now(ctx, viewer.member.familyId);
    await shareItem(ctx, { familyId: viewer.member.familyId, ownerId: viewer.member._id, item: { kind: 'event', eventId: event._id }, now });
    await calendarChanged(ctx, viewer.member.familyId, now);
    return null;
  },
});

export const unshare = mutation({
  ...pick(API.events.unshare),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const now = await clock.now(ctx, viewer.member.familyId);
    await unshareEvent(ctx, { familyId: viewer.member.familyId, ownerId: viewer.member._id, eventId: args.eventId, now });
    await calendarChanged(ctx, viewer.member.familyId, now);
    return null;
  },
});
