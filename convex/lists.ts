// CONTRACT §4 `lists.all` / `.addItem` / `.check` / `.remove`.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { visibleLists } from './model/home';
import { canSeeScoped } from './model/visibility';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

export const all = query({
  ...pick(API.lists.all),
  handler: async (ctx) => visibleLists(ctx, await requireViewer(ctx)),
});

export const addItem = mutation({
  ...pick(API.lists.addItem),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const list = await ctx.db.get(args.listId);
    if (!list || list.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (!canSeeScoped(list.scope, { memberId: viewer.member._id, role: viewer.member.role }, { ownerId: list.ownerId })) fail('FORBIDDEN');
    const now = await clock.now(ctx, viewer.member.familyId);
    return ctx.db.insert('listItems', { familyId: viewer.member.familyId, listId: list._id, text: args.text, checked: false, addedBy: viewer.member._id, at: now });
  },
});

export const check = mutation({
  ...pick(API.lists.check),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const list = await ctx.db.get(item.listId);
    if (!list || !canSeeScoped(list.scope, { memberId: viewer.member._id, role: viewer.member.role }, { ownerId: list.ownerId })) fail('FORBIDDEN');
    await ctx.db.patch(item._id, { checked: args.checked });
    return null;
  },
});

export const remove = mutation({
  ...pick(API.lists.remove),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const list = await ctx.db.get(item.listId);
    if (!list || !canSeeScoped(list.scope, { memberId: viewer.member._id, role: viewer.member.role }, { ownerId: list.ownerId })) fail('FORBIDDEN');
    await ctx.db.delete(item._id);
    return null;
  },
});
