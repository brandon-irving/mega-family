// CONTRACT §4 `lists.all` / `.addItem` / `.check` / `.remove`.
import { GIFT_LIST_NAME } from '../shared/config/copy';
import { canSeeListItem } from './model/listAccess';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { visibleLists } from './model/home';
import { canSeeScoped } from './model/visibility';
import { clock } from './ports/clock';
import { requireNotKid, requireViewer } from './model/viewer';

export const create = mutation({
  ...pick(API.lists.create),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireNotKid(viewer.member.role);
    const name = args.name.trim();
    if (!name || name.length > 80) fail('VALIDATION', 'Use a list name between 1 and 80 characters.');
    const lists = await ctx.db.query('lists').withIndex('by_family', q => q.eq('familyId', viewer.member.familyId)).collect();
    const existing = lists.find(list => list.name.toLowerCase() === name.toLowerCase() && list.scope === args.scope && (args.scope !== 'personal' || list.ownerId === viewer.member._id));
    if (existing) return existing._id;
    return ctx.db.insert('lists', { familyId: viewer.member.familyId, name, scope: args.scope, ownerId: viewer.member._id });
  },
});

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
    if (list.name === GIFT_LIST_NAME && list.scope === 'adults') fail('VALIDATION', 'Add gifts from Ideas so MEGA can keep the recipient hidden.');
    const text = args.text.trim();
    if (!text || text.length > 500) fail('VALIDATION', 'Use between 1 and 500 characters.');
    const now = await clock.now(ctx, viewer.member.familyId);
    return ctx.db.insert('listItems', { familyId: viewer.member.familyId, listId: list._id, text, checked: false, addedBy: viewer.member._id, at: now });
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
    if (!canSeeListItem(viewer.member, item, list)) fail('NOT_FOUND');
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
    if (!canSeeListItem(viewer.member, item, list)) fail('NOT_FOUND');
    await ctx.db.delete(item._id);
    return null;
  },
});
