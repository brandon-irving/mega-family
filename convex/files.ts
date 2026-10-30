// CONTRACT §4 `files.uploadUrl`.
import { API } from '../shared/domain/api';
import { canReadKidThread } from '../shared/domain/family';
import { fail } from './model/errors';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { requireViewer } from './model/viewer';

export const uploadUrl = mutation({
  ...pick(API.files.uploadUrl),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// Resolve through the owning message/thread, never accept an arbitrary storage id from a reader.
export const messageUrl = query({
  ...pick(API.files.messageUrl),
  handler: async (ctx, { messageId }) => {
    const viewer = await requireViewer(ctx);
    const message = await ctx.db.get(messageId);
    const thread = message ? await ctx.db.get(message.threadId) : null;
    if (!message || !thread || message.familyId !== viewer.member.familyId || thread.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (thread.ownerId !== viewer.member._id) {
      const controls = await ctx.db.query('kidControls').withIndex('by_family_member', q => q.eq('familyId', viewer.member.familyId).eq('memberId', thread.ownerId)).unique();
      if (!canReadKidThread(viewer.isParentOf.includes(thread.ownerId), controls?.parentsCanReadChat)) fail('NOT_FOUND');
    }
    if (message.body.type !== 'image' && message.body.type !== 'file') fail('NOT_FOUND');
    return ctx.storage.getUrl(message.body.storageId);
  },
});
