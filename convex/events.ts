// CONTRACT §4 `events.create` / `.update` / `.cancel`.
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer, sameFamilyMember } from './model/viewer';

export const create = mutation({
  ...pick(API.events.create),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    for (const id of args.who) await sameFamilyMember(ctx, viewer.member.familyId, id);
    return ctx.db.insert('events', {
      familyId: viewer.member.familyId,
      title: args.title,
      start: args.start,
      end: args.end,
      allDay: args.allDay,
      who: args.who,
      place: args.place,
      source: 'mega',
      createdBy: viewer.member._id,
      scope: args.scope,
      cancelled: false,
    });
  },
});

export const update = mutation({
  ...pick(API.events.update),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (event.createdBy !== viewer.member._id && viewer.member.role !== 'admin') fail('FORBIDDEN');
    if (args.patch.who) for (const id of args.patch.who) await sameFamilyMember(ctx, viewer.member.familyId, id);
    const patch = Object.fromEntries(Object.entries(args.patch).filter(([, v]) => v !== undefined));
    await ctx.db.patch(event._id, patch);
    return null;
  },
});

export const cancel = mutation({
  ...pick(API.events.cancel),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (event.createdBy !== viewer.member._id && viewer.member.role !== 'admin') fail('FORBIDDEN');
    await ctx.db.patch(event._id, { cancelled: true });
    return null;
  },
});
