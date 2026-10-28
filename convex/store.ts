// CONTRACT §4 `store.*` (GD, v0.13). Kids only: see convex/model/store.ts for the ownership rules.
import { STORE_RULES } from '../shared/config/store';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { buyItem, catalogFor } from './model/store';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

function requireShopper(role: string) {
  if (!(STORE_RULES.shoppers as readonly string[]).includes(role)) fail('FORBIDDEN', 'the Store is for kids');
}

export const catalog = query({
  ...pick(API.store.catalog),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireShopper(viewer.member.role);
    return catalogFor(ctx, viewer.member, viewer.mega);
  },
});

export const buy = mutation({
  ...pick(API.store.buy),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireShopper(viewer.member.role);
    const now = await clock.now(ctx, viewer.member.familyId);
    return buyItem(ctx, { kid: viewer.member, mega: viewer.mega, itemId: args.itemId, now });
  },
});
