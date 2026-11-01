// G4b (CONTRACT v0.16). The normalized shapes of the shopping and holiday providers, defined once: tables, cards,
// view models and the ports (convex/ports/productCatalog.ts, holidays.ts) all use these, never vendor JSON.
import { type Infer, v } from 'convex/values';

/** A pointer to one catalog product: Shopify Global Catalog ids (`gid://shopify/p/…` for the product,
 * `gid://shopify/ProductVariant/…` for the variant). This is all we keep from a search: Shopify's catalog terms
 * (shopify.dev/docs/agents/catalog → Usage guidelines) don't allow caching search results or images, so the app
 * reads current details through `shopping.products`, which looks the refs up live. A variant id is preferred
 * when known: prices are per variant. */
export const productRef = v.object({ productId: v.string(), variantId: v.optional(v.string()) });
export type ProductRef = Infer<typeof productRef>;

/** A product as the app shows it, read live from the catalog (never stored). Prices are minor units (cents).
 * `listPriceCents` is the merchant's compare-at price, present only when it's higher than `priceCents` (on sale).
 * `imageUrl` is the merchant's CDN url, rendered directly by the app (never downloaded to our servers). */
export const product = v.object({
  productId: v.string(),
  variantId: v.optional(v.string()),
  title: v.string(),
  priceCents: v.number(),
  listPriceCents: v.optional(v.number()),
  currency: v.string(),
  store: v.string(),
  url: v.string(),
  imageUrl: v.optional(v.string()),
  available: v.boolean(),
});
export type Product = Infer<typeof product>;

/** A public holiday (Nager.Date v3 `PublicHolidays`), normalized. `global: false` holidays apply only in
 * `regions` (ISO 3166-2, e.g. "US-NY"); `types` is Nager's list ("Public", "Bank", "School", "Observance"…). */
export const holiday = v.object({
  date: v.string(), // "YYYY-MM-DD"
  name: v.string(),
  localName: v.string(),
  global: v.boolean(),
  regions: v.optional(v.array(v.string())),
  types: v.array(v.string()),
});
export type Holiday = Infer<typeof holiday>;

// ---------- G5 (CONTRACT v0.17) ----------

/** One event from an outside calendar (Google Calendar, a schedule link, this phone), normalized. `externalId` is
 * the provider's id (+ the occurrence start for a recurring one), unique within its integration. Timed events
 * have `start`/`end` (epoch ms); all-day ones have `allDay` ("YYYY-MM-DD", the family's local date) and `start`
 * = local midnight. `cancelled` = the provider says it's gone (Google incremental sync), so we remove our copy. */
export const externalEvent = v.object({
  externalId: v.string(),
  title: v.string(),
  start: v.number(),
  end: v.optional(v.number()),
  allDay: v.optional(v.string()),
  location: v.optional(v.string()),
  cancelled: v.boolean(),
});
export type ExternalEvent = Infer<typeof externalEvent>;

/** One email as the extraction step sees it: never stored. `fromName` is the display name only ("Maple Elementary
 * Office"); `text` is the plain-text body cut to GMAIL.maxBodyChars. Untrusted data: it can inform what MEGA adds,
 * never cause a tool call or a share. */
export type MailMessage = {
  id: string;
  threadId: string;
  internalDate: number;
  fromName: string;
  fromAddress: string;
  replyTo?: string;
  rfcMessageId?: string;
  subject: string;
  text: string;
};
