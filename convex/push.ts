// CONTRACT §4 `push.register`.
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { requireViewer } from './model/viewer';

export const register = mutation({
  ...pick(API.push.register),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const existing = viewer.settings.pushTokens.filter((t) => t.token !== args.token);
    await ctx.db.patch(viewer.settings._id, { pushTokens: [...existing, { token: args.token, platform: args.platform }] });
    return null;
  },
});
