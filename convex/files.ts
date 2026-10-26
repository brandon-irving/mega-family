// CONTRACT §4 `files.uploadUrl`.
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { requireViewer } from './model/viewer';

export const uploadUrl = mutation({
  ...pick(API.files.uploadUrl),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return ctx.storage.generateUploadUrl();
  },
});
