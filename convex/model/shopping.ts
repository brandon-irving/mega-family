// G4b (CONTRACT v0.16): price watches on gift-list products. Same audience as gift ideas (GIFTS.viewers, never
// the gift's recipient — invariant 2). A watch is the family's own saved item: it keeps the product ref, the
// title/store/url the adult saw when saving it, and the prices our checks observed; never a search result
// (Shopify's catalog terms, invariant 3). A drop alerts once per watch × price, as a quiet `update` (invariant 6).
import { G4B_COPY, fillCopy } from '../../shared/config/copy';
import { priceDropDedupeKey } from '../../shared/config/proactive';
import { SHOPPING, formatPriceCents } from '../../shared/config/shopping';
import type { Product, ProductRef } from '../../shared/domain/integrationShapes';
import { addDays, localDate } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { IntegrationFailure } from '../ports/integrationResult';
import { fail } from './errors';
import { canSeeGiftsFor, nextBirthday } from './gifts';
import { enqueueCardCandidate } from './proactive';

type Ctx = QueryCtx | MutationCtx;

/** Kids never shop (invariant 5): FORBIDDEN for every shopping function a kid calls directly. */
export function requireShopper(member: Doc<'members'>): void {
  if (!(SHOPPING.viewers as readonly string[]).includes(member.role)) fail('FORBIDDEN', 'shopping is for grown-ups');
}

/** A watch the viewer may see: same family, a grown-up, and not the gift's recipient. Anything else is
 * NOT_FOUND (a kid or the recipient learns nothing, not even that it exists). */
export async function requireVisibleWatch(ctx: Ctx, viewer: Doc<'members'>, watchId: Id<'priceWatches'>): Promise<Doc<'priceWatches'>> {
  const w = await ctx.db.get(watchId);
  if (!w || w.familyId !== viewer.familyId || !canSeeGiftsFor(viewer, w.forMemberId)) fail('NOT_FOUND');
  return w;
}

export async function activeWatches(ctx: Ctx, familyId: Id<'families'>): Promise<Doc<'priceWatches'>[]> {
  return ctx.db
    .query('priceWatches')
    .withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'watching'))
    .collect();
}

const sameRef = (a: ProductRef, b: ProductRef) => a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);

/** `gifts.addToList`'s watch step, after the one live lookup for the baseline: one watch per looked-up product
 * of that idea, skipping refs already watched for it and stopping at SHOPPING.maxActiveWatchesPerFamily. */
export async function insertWatches(
  ctx: MutationCtx,
  p: { set: Doc<'giftIdeas'>; index: number; createdBy: Id<'members'>; products: Product[]; now: number },
): Promise<number> {
  const existing = await ctx.db
    .query('priceWatches')
    .withIndex('by_family_ideas', (q) => q.eq('familyId', p.set.familyId).eq('giftIdeasId', p.set._id))
    .collect();
  let active = (await activeWatches(ctx, p.set.familyId)).length;
  let made = 0;
  for (const product of p.products) {
    if (active >= SHOPPING.maxActiveWatchesPerFamily) break;
    const ref: ProductRef = { productId: product.productId, ...(product.variantId ? { variantId: product.variantId } : {}) };
    if (existing.some((w) => w.ideaIndex === p.index && sameRef(w.ref, ref) && w.status === 'watching')) continue;
    await ctx.db.insert('priceWatches', {
      familyId: p.set.familyId,
      giftIdeasId: p.set._id,
      ideaIndex: p.index,
      forMemberId: p.set.forMemberId,
      ref,
      title: product.title.slice(0, 120),
      store: product.store.slice(0, 80),
      url: product.url.slice(0, 500),
      currency: product.currency,
      baselinePriceCents: product.priceCents,
      lastPriceCents: product.priceCents,
      lastCheckedAt: p.now,
      status: 'watching',
      createdBy: p.createdBy,
      createdAt: p.now,
    });
    active++;
    made++;
  }
  return made;
}

/** Is `price` a drop worth telling the adults about? Below the baseline by SHOPPING.dropMinPct or
 * dropMinCents, and lower than the last price already announced (a rebound, or the same price, never alerts). */
export function isAlertableDrop(w: Pick<Doc<'priceWatches'>, 'baselinePriceCents' | 'alertedPriceCents'>, priceCents: number): boolean {
  const drop = w.baselinePriceCents - priceCents;
  if (drop <= 0) return false;
  const big = drop >= SHOPPING.dropMinCents || drop * 100 >= w.baselinePriceCents * SHOPPING.dropMinPct;
  return big && (w.alertedPriceCents === undefined || priceCents < w.alertedPriceCents);
}

/** The watch's occasion date (its gift set's), and whether the watch has outlived it. */
async function occasionOf(ctx: Ctx, w: Doc<'priceWatches'>): Promise<string | null> {
  return (await ctx.db.get(w.giftIdeasId))?.date ?? null;
}

/** Stops watches whose occasion was more than SHOPPING.stopAfterOccasionDays ago (or whose gift set is gone). */
export async function stopExpiredWatches(ctx: MutationCtx, familyId: Id<'families'>, tz: string, now: number): Promise<void> {
  const today = localDate(now, tz);
  for (const w of await activeWatches(ctx, familyId)) {
    const date = await occasionOf(ctx, w);
    if (!date || addDays(date, SHOPPING.stopAfterOccasionDays) < today) await ctx.db.patch(w._id, { status: 'stopped', stoppedAt: now });
  }
}

/** The grown-ups who hear about a watch's price drop: adults with a login who may see the gift ideas
 * (never the recipient, never a kid). */
async function dropAudience(ctx: MutationCtx, w: Doc<'priceWatches'>): Promise<Doc<'members'>[]> {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', w.familyId))
    .collect();
  return members.filter((m) => !!m.authId && canSeeGiftsFor(m, w.forMemberId));
}

export type PriceCheck = { watchId: Id<'priceWatches'>; priceCents?: number; failure?: IntegrationFailure };

/** Records one price check per watch (from the cron's live lookups) and queues a `priceDrop` card for each
 * adult viewer when the drop is alertable. A `no_result` (the catalog no longer knows the product) stops the
 * watch; any other failure is recorded and retried next time. */
export async function recordPriceChecks(ctx: MutationCtx, p: { familyId: Id<'families'>; checks: PriceCheck[]; now: number }): Promise<void> {
  const family = await ctx.db.get(p.familyId);
  if (!family) return;
  const today = localDate(p.now, family.timezone);
  for (const c of p.checks) {
    const w = await ctx.db.get(c.watchId);
    if (!w || w.familyId !== p.familyId || w.status !== 'watching') continue;
    if (c.priceCents === undefined) {
      await ctx.db.patch(w._id, { lastCheckedAt: p.now, lastFailure: c.failure ?? 'error', ...(c.failure === 'no_result' ? { status: 'stopped' as const, stoppedAt: p.now } : {}) });
      continue;
    }
    const alert = isAlertableDrop(w, c.priceCents);
    await ctx.db.patch(w._id, { lastPriceCents: c.priceCents, lastCheckedAt: p.now, lastFailure: undefined, ...(alert ? { alertedPriceCents: c.priceCents } : {}) });
    if (!alert) continue;
    const forMember = await ctx.db.get(w.forMemberId);
    const date = await occasionOf(ctx, w);
    const days = date && date >= today ? nextBirthday(date, today).daysAway : 0;
    const values = { title: w.title, price: formatPriceCents(c.priceCents, w.currency), was: formatPriceCents(w.baselinePriceCents, w.currency), who: forMember?.name ?? 'Their', days };
    for (const adult of await dropAudience(ctx, w)) {
      await enqueueCardCandidate(ctx, {
        familyId: p.familyId,
        recipientId: adult._id,
        kind: 'update',
        dedupeKey: priceDropDedupeKey(w._id, c.priceCents, adult._id),
        title: fillCopy(G4B_COPY.priceDropTitle, values),
        text: fillCopy(days > 0 ? G4B_COPY.priceDropBody : G4B_COPY.priceDropBodyToday, values),
        source: { kind: 'priceDrop', watchId: w._id, priceCents: c.priceCents },
        buttons: 'price.default',
        now: p.now,
      });
    }
  }
}

/** Stops a watch (the card's Stop watching, or the push button). Idempotent. */
export async function stopWatch(ctx: MutationCtx, w: Doc<'priceWatches'>, by: Id<'members'>, now: number): Promise<string> {
  if (w.status === 'watching') await ctx.db.patch(w._id, { status: 'stopped', stoppedBy: by, stoppedAt: now });
  return fillCopy(G4B_COPY.priceStopped, { title: w.title });
}
