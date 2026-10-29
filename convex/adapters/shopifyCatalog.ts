// The real ProductCatalog adapter: Shopify Global Catalog (UCP Catalog over MCP). Docs read Oct 28:
// shopify.dev/docs/agents/catalog/global-catalog (search_catalog / lookup_catalog, JSON-RPC 2.0 `tools/call` at
// POST https://catalog.shopify.com/api/ucp/mcp) and shopify.dev/docs/agents/profiles (our platform profile URL in
// `arguments.meta["ucp-agent"].profile`; without one Shopify answers 422 `invalid_profile_url`). Live probe Oct 28:
// prices, `url`, `seller` and `availability` sit on each VARIANT (the product object had no `url`); lookups carry
// `variants[].inputs[]` naming the requested id they matched, and unknown ids come back as `messages[]` with
// `code: "not_found"`. The only file that knows Shopify's JSON.
//
// Usage rules (binding): no checkout — `checkout_url` is never read; results are not cached here or anywhere
// (callers keep refs only); image URLs are passed through for the app to render, never fetched.
import { SHOPPING } from '../../shared/config/shopping';
import type { Product, ProductRef } from '../../shared/domain/integrationShapes';
import type { ProductCatalog, ProductLookupRequest, ProductResults, ProductSearchRequest } from '../ports/productCatalog';
import { fetchJson } from './httpFetch';

/** Our hosted UCP platform profile (convex/http.ts serves it). Null when the deployment's site URL is unknown,
 * which fails closed as `not_configured` (Shopify can't negotiate without a profile). */
export function agentProfileUrl(): string | null {
  const site = process.env.CONVEX_SITE_URL?.trim();
  return site ? `${site.replace(/\/$/, '')}${SHOPPING.agentProfilePath}` : null;
}

type Money = { amount?: unknown; currency?: unknown };
type RawVariant = {
  id?: unknown;
  url?: unknown;
  price?: Money;
  list_price?: Money;
  availability?: { available?: unknown };
  seller?: { name?: unknown };
  media?: { type?: unknown; url?: unknown }[];
  inputs?: { id?: unknown }[];
};
type RawProduct = { id?: unknown; title?: unknown; url?: unknown; media?: { type?: unknown; url?: unknown }[]; variants?: RawVariant[] };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const cents = (m: Money | undefined): number | undefined => (typeof m?.amount === 'number' && Number.isFinite(m.amount) && m.amount >= 0 ? Math.round(m.amount) : undefined);
const https = (u: string | undefined): string | undefined => (u && /^https:\/\//.test(u) ? u : undefined);

function imageOf(media: RawProduct['media']): string | undefined {
  return https(str(media?.find((m) => m?.type === 'image' && str(m.url))?.url));
}

/** One catalog product (one chosen variant) → our `Product`. Null when a field the card can't do without is
 * missing (price, title, an https product page, the store's name): never filled in by guessing. */
function toProduct(p: RawProduct, variant: RawVariant | undefined): Product | null {
  const productId = str(p.id);
  const title = str(p.title);
  if (!productId || !title || !variant) return null;
  const priceCents = cents(variant.price);
  const currency = str(variant.price?.currency);
  const url = https(str(variant.url) ?? str(p.url));
  const store = str(variant.seller?.name);
  if (priceCents === undefined || !currency || !url || !store) return null;
  const list = cents(variant.list_price);
  const imageUrl = imageOf(variant.media) ?? imageOf(p.media);
  return {
    productId,
    ...(str(variant.id) ? { variantId: str(variant.id) } : {}),
    title: title.slice(0, 200),
    priceCents,
    ...(list !== undefined && list > priceCents && str(variant.list_price?.currency) === currency ? { listPriceCents: list } : {}),
    currency,
    store: store.slice(0, 100),
    url,
    ...(imageUrl ? { imageUrl } : {}),
    available: variant.availability?.available !== false,
  };
}

function rpcPayload(json: unknown): { products: RawProduct[]; messages: { code?: unknown; content?: unknown }[] } | { error: string } {
  const j = json as { error?: { data?: { code?: unknown }; message?: unknown }; result?: { isError?: unknown; structuredContent?: { products?: unknown; messages?: unknown } } };
  if (j?.error) return { error: String(j.error.data?.code ?? j.error.message ?? 'rpc error') };
  const sc = j?.result?.structuredContent;
  if (!sc || j.result?.isError === true) return { error: 'no structuredContent' };
  return { products: Array.isArray(sc.products) ? (sc.products as RawProduct[]) : [], messages: Array.isArray(sc.messages) ? (sc.messages as { code?: unknown; content?: unknown }[]) : [] };
}

/** `search_catalog` → products, each at its first variant (the one the search matched, priced for the filters). */
export function parseSearch(json: unknown): ProductResults {
  const payload = rpcPayload(json);
  if ('error' in payload) return { ok: false, failure: 'error', detail: payload.error };
  const products = payload.products.flatMap((p) => {
    const product = toProduct(p, p.variants?.[0]);
    return product ? [product] : [];
  });
  return { ok: true, products, notFound: [] };
}

/** `lookup_catalog` → one product per ref, in `refs` order: the variant whose `inputs` name the ref's id
 * (variant id preferred), else the product's first variant for a product-id ref. Refs the catalog didn't
 * resolve (a `not_found` message, or simply missing) are returned in `notFound`. */
export function parseLookup(json: unknown, refs: ProductRef[]): ProductResults {
  const payload = rpcPayload(json);
  if ('error' in payload) return { ok: false, failure: 'error', detail: payload.error };
  const products: Product[] = [];
  const notFound: ProductRef[] = [];
  for (const ref of refs) {
    const want = ref.variantId ?? ref.productId;
    let match: Product | null = null;
    for (const p of payload.products) {
      const byInput = p.variants?.find((x) => x.inputs?.some((i) => i?.id === want) || (ref.variantId && x.id === ref.variantId));
      if (byInput) match = toProduct(p, byInput);
      else if (!ref.variantId && p.id === ref.productId) match = toProduct(p, p.variants?.[0]);
      if (match) break;
    }
    if (match) products.push(match);
    else notFound.push(ref);
  }
  return { ok: true, products, notFound };
}

async function call(name: 'search_catalog' | 'lookup_catalog', catalog: Record<string, unknown>): Promise<{ ok: true; json: unknown } | { ok: false; failure: 'not_configured' | 'rate_limited' | 'error' | 'no_result'; detail: string }> {
  const profile = agentProfileUrl();
  if (!profile) return { ok: false, failure: 'not_configured', detail: 'CONVEX_SITE_URL is not set (no agent profile URL)' };
  const res = await fetchJson(
    SHOPPING.endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name, arguments: { meta: { 'ucp-agent': { profile } }, catalog } } }),
    },
    SHOPPING.timeoutMs,
  );
  if (!res.ok) return { ok: false, failure: res.failure, detail: res.detail };
  return { ok: true, json: res.json };
}

export function searchArguments(request: ProductSearchRequest): Record<string, unknown> {
  return {
    query: request.query,
    filters: {
      ships_to: { country: request.country },
      available: true,
      ...(request.maxPriceCents !== undefined ? { price: { max: Math.max(0, Math.round(request.maxPriceCents)) } } : {}),
    },
    context: { address_country: request.country },
    pagination: { limit: Math.min(50, Math.max(1, request.limit)) },
  };
}

export function lookupArguments(request: ProductLookupRequest): Record<string, unknown> {
  return { ids: [...new Set(request.refs.map((r) => r.variantId ?? r.productId))].slice(0, 50), context: { address_country: request.country } };
}

export const shopifyCatalog: ProductCatalog = {
  async search(request) {
    const res = await call('search_catalog', searchArguments(request));
    if (!res.ok) return res;
    const parsed = parseSearch(res.json);
    return parsed.ok ? { ...parsed, products: parsed.products.slice(0, request.limit) } : parsed;
  },
  async lookup(request) {
    if (!request.refs.length) return { ok: true, products: [], notFound: [] };
    const res = await call('lookup_catalog', lookupArguments(request));
    if (!res.ok) return res;
    return parseLookup(res.json, request.refs);
  },
};
