// CONTRACT §4 `shopping.*` (G4b, v0.16) and the price-watch cron. Products come from the ProductCatalog port
// (Shopify Global Catalog) and are read live, never stored (invariant 3): `products` looks refs up for a card;
// watches keep only the ref plus what the adult saw when saving. Kids never shop (invariant 5); a watch is for
// the adults who can see the gift ideas, never the gift's recipient (invariant 2). No checkout anywhere.
import { v } from 'convex/values';
import { SHOPPING } from '../shared/config/shopping';
import { API } from '../shared/domain/api';
import { productRef } from '../shared/domain/integrationShapes';
import { integrationFailure } from '../shared/domain/tables';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { getProductCatalog } from './adapters/registry';
import { pick } from './model/define';
import { fail } from './model/errors';
import { canSeeGiftsFor, requireGiftViewer } from './model/gifts';
import { activeWatches, insertWatches, recordPriceChecks, requireShopper, requireVisibleWatch, stopExpiredWatches, stopWatch, type PriceCheck } from './model/shopping';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

const MAX_ID_LENGTH = 200;

/** The action's viewer check (an action has no db): signed in, a member, a grown-up. Throws the contract codes. */
export const requireShopperCheck = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireShopper(viewer.member);
    return null;
  },
});

export const products = action({
  ...pick(API.shopping.products),
  handler: async (ctx, { refs }) => {
    await ctx.runQuery(internal.shopping.requireShopperCheck, {});
    if (refs.length > SHOPPING.maxLookup) fail('VALIDATION', `at most ${SHOPPING.maxLookup} products at a time`);
    if (refs.some((r) => !r.productId.trim() || r.productId.length > MAX_ID_LENGTH || (r.variantId ?? '').length > MAX_ID_LENGTH)) fail('VALIDATION', 'not a product id');
    if (!refs.length) return { products: [] };
    // Read live and returned as is: nothing here is written anywhere (Shopify's terms forbid caching results).
    const r = await getProductCatalog().lookup({ refs, country: SHOPPING.country });
    return r.ok ? { products: r.products } : { products: [], failure: r.failure };
  },
});

export const watches = query({
  ...pick(API.shopping.watches),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireShopper(viewer.member);
    return (await activeWatches(ctx, viewer.member.familyId)).filter((w) => canSeeGiftsFor(viewer.member, w.forMemberId));
  },
});

export const watch = query({
  ...pick(API.shopping.watch),
  handler: async (ctx, { watchId }) => {
    const viewer = await requireViewer(ctx);
    return requireVisibleWatch(ctx, viewer.member, watchId);
  },
});

export const unwatch = mutation({
  ...pick(API.shopping.unwatch),
  handler: async (ctx, { watchId }) => {
    const viewer = await requireViewer(ctx);
    const w = await requireVisibleWatch(ctx, viewer.member, watchId);
    await stopWatch(ctx, w, viewer.member._id, await clock.now(ctx, w.familyId));
    return null;
  },
});

// ---------- starting watches (gifts.addToList) ----------

/** The refs behind one gift idea, re-checking that the adult who added it may still see the set. */
export const watchTargets = internalQuery({
  args: { giftIdeasId: v.id('giftIdeas'), index: v.number(), createdBy: v.id('members') },
  returns: v.union(v.array(productRef), v.null()),
  handler: async (ctx, a) => {
    const set = await ctx.db.get(a.giftIdeasId);
    const adult = await ctx.db.get(a.createdBy);
    if (!set || !adult || adult.familyId !== set.familyId || !canSeeGiftsFor(adult, set.forMemberId)) return null;
    return set.ideas[a.index]?.productRefs ?? null;
  },
});

export const saveWatches = internalMutation({
  args: {
    giftIdeasId: v.id('giftIdeas'),
    index: v.number(),
    createdBy: v.id('members'),
    products: v.array(v.object({ productId: v.string(), variantId: v.optional(v.string()), title: v.string(), priceCents: v.number(), currency: v.string(), store: v.string(), url: v.string() })),
  },
  returns: v.number(),
  handler: async (ctx, a) => {
    const set = await ctx.db.get(a.giftIdeasId);
    const adult = await ctx.db.get(a.createdBy);
    if (!set || !adult) return 0;
    requireGiftViewer(adult, set.forMemberId);
    const now = await clock.now(ctx, set.familyId);
    return insertWatches(ctx, { set, index: a.index, createdBy: adult._id, products: a.products.map((p) => ({ ...p, available: true })), now });
  },
});

/** One live lookup for the baseline price, then a watch per product; a failed lookup starts no watch
 * (never a guessed baseline). */
export const startWatches = internalAction({
  args: { giftIdeasId: v.id('giftIdeas'), index: v.number(), createdBy: v.id('members') },
  returns: v.null(),
  handler: async (ctx, a) => {
    const refs = await ctx.runQuery(internal.shopping.watchTargets, a);
    if (!refs?.length) return null;
    const r = await getProductCatalog().lookup({ refs, country: SHOPPING.country });
    if (!r.ok || !r.products.length) return null;
    const products = r.products.map((p) => ({ productId: p.productId, variantId: p.variantId, title: p.title, priceCents: p.priceCents, currency: p.currency, store: p.store, url: p.url }));
    await ctx.runMutation(internal.shopping.saveWatches, { ...a, products });
    return null;
  },
});

// ---------- the price check (cron every SHOPPING.priceCheckHours) ----------

export const dueWatches = internalQuery({
  args: { familyId: v.id('families') },
  returns: v.array(v.object({ watchId: v.id('priceWatches'), ref: productRef })),
  handler: async (ctx, { familyId }) => (await activeWatches(ctx, familyId)).map((w) => ({ watchId: w._id, ref: w.ref })),
});

export const recordPrices = internalMutation({
  args: { familyId: v.id('families'), checks: v.array(v.object({ watchId: v.id('priceWatches'), priceCents: v.optional(v.number()), failure: v.optional(integrationFailure) })) },
  returns: v.null(),
  handler: async (ctx, { familyId, checks }) => {
    const family = await ctx.db.get(familyId);
    if (!family) return null;
    const now = await clock.now(ctx, familyId);
    await stopExpiredWatches(ctx, familyId, family.timezone, now);
    await recordPriceChecks(ctx, { familyId, checks, now });
    return null;
  },
});

const LOOKUP_BATCH = 50; // Shopify's lookup_catalog takes up to 50 ids

/** One family's price check: live lookups in batches, then one write (which also stops expired watches). */
export const checkFamily = internalAction({
  args: { familyId: v.id('families') },
  returns: v.null(),
  handler: async (ctx, { familyId }) => {
    const due = await ctx.runQuery(internal.shopping.dueWatches, { familyId });
    const checks: PriceCheck[] = [];
    for (let i = 0; i < due.length; i += LOOKUP_BATCH) {
      const batch = due.slice(i, i + LOOKUP_BATCH);
      const r = await getProductCatalog().lookup({ refs: batch.map((b) => b.ref), country: SHOPPING.country });
      for (const b of batch) {
        if (!r.ok) {
          checks.push({ watchId: b.watchId, failure: r.failure });
          continue;
        }
        // Prices are per variant: a variant ref matches only that variant (the product's cluster id can differ
        // between a search and a lookup), a product ref its product.
        const p = r.products.find((x) => (b.ref.variantId ? x.variantId === b.ref.variantId : x.productId === b.ref.productId));
        checks.push(p ? { watchId: b.watchId, priceCents: p.priceCents } : { watchId: b.watchId, failure: 'no_result' });
      }
    }
    await ctx.runMutation(internal.shopping.recordPrices, { familyId, checks });
    return null;
  },
});

export const checkAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const familyIds: Id<'families'>[] = await ctx.runQuery(internal.weather.familyIds, {});
    for (const familyId of familyIds) await ctx.scheduler.runAfter(0, internal.shopping.checkFamily, { familyId });
    return null;
  },
});
