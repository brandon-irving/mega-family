// CONTRACT §4 `images.create` (stub: queues, no model call, no spend) / `.get` (real).
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer } from './model/viewer';

export const create = mutation({
  ...pick(API.images.create),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (args.purpose === 'wallpaper' && viewer.member.role === 'kid') fail('FORBIDDEN', 'wallpapers are adults only for now');
    const imageId = await ctx.db.insert('images', {
      familyId: viewer.member.familyId,
      createdBy: viewer.member._id,
      purpose: args.purpose,
      prompt: args.prompt,
      status: 'queued',
    });
    return { imageId };
  },
});

export const get = query({
  ...pick(API.images.get),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const image = await ctx.db.get(args.imageId);
    if (!image || image.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const url = image.storageId ? await ctx.storage.getUrl(image.storageId) : null;
    return { status: image.status, url };
  },
});
