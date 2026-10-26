// CONTRACT §4 `settings.set` — adult fields refused for kids. Decision (documented, not spelled out in
// CONTRACT): theme/accent are cosmetic and always allowed; `notify` (quiet hours, daily cap) is parent
// territory, already governed by `kidControls`; a kid's wallpaper may only be a preset, never a photo or a
// generated image (generated ones also cost credits, which `images.create` already blocks for kids).
import { API } from '../shared/domain/api';
import { mutation } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer } from './model/viewer';

export const set = mutation({
  ...pick(API.settings.set),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') {
      if (args.notify !== undefined) fail('FORBIDDEN', 'quiet hours and caps are set by a parent');
      if (args.wallpaper && args.wallpaper.kind !== 'preset') fail('FORBIDDEN', 'kids can only use preset wallpapers');
    }
    const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
    await ctx.db.patch(viewer.settings._id, patch);
    return null;
  },
});
