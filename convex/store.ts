// CONTRACT §4 `store.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md. `catalog` already
// returns the real catalog from config (prices, free items owned), with a zero balance and nothing bought.
import { STORE_CATALOG, STORE_RULES, type StoreItemId } from '../shared/config/store';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const catalog = query({
  ...pick(API.store.catalog),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (!STORE_RULES.shoppers.includes(viewer.member.role)) fail('FORBIDDEN');
    const items = (Object.entries(STORE_CATALOG) as [StoreItemId, { label: string; price: number; hex?: string }][]).map(([id, item]) => ({
      id,
      label: item.label,
      price: item.price,
      ...(item.hex ? { hex: item.hex } : {}),
      owned: item.price === 0,
      wearing: false,
    }));
    return { balance: 0, items };
  },
});

export const buy = mutation({
  ...pick(API.store.buy),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (!STORE_RULES.shoppers.includes(viewer.member.role)) fail('FORBIDDEN');
    return notBuiltYet('store.buy');
  },
});
