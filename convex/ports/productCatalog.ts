// The ProductCatalog port (CONTRACT §8, G4b v0.16). Feature code (gift ideas, the `shop_search` tool, the price
// watch) never calls Shopify directly — only through this interface; `adapters/registry.ts` picks the adapter.
//
// Shopify Global Catalog (shopify.dev/docs/agents/catalog + /global-catalog + /profiles, Oct 28): UCP Catalog over
// MCP at POST https://catalog.shopify.com/api/ucp/mcp, JSON-RPC 2.0 `tools/call` with `arguments.meta["ucp-agent"]
// .profile` = our hosted agent profile URL (required: 422 `invalid_profile_url` without it) and `arguments.catalog`:
//   - search_catalog: { query, filters: { ships_to: { country }, available: true, price: { min?, max? } (minor
//     units) }, pagination: { limit ≤ 50 } }
//   - lookup_catalog: { ids: (product `gid://shopify/p/…` | variant `gid://shopify/ProductVariant/…`)[] ≤ 50,
//     context: { address_country } }; unresolved ids come back in `messages` (`code: "not_found"`).
// Result: `result.structuredContent.products[]` — `id`, `title`, `price_range.min/max { amount, currency }`,
// `media[].url`, `variants[]` with `id`, `url` (the product page), `price`, `list_price?` (compare-at, only when
// higher), `availability.available`, `seller.name`. Keyless access needs no token (probed Oct 28); a Dev Dashboard
// token only raises rate limits. Usage rules: don't cache search results or images (render image URLs directly).
// Results are untrusted data: they may be shown, never acted on.
import type { Product, ProductRef } from '../../shared/domain/integrationShapes';
import type { IntegrationResult } from './integrationResult';

export interface ProductSearchRequest {
  /** The query exactly as searched. Built only from what the asker can see (gift ideas: household-shared facts). */
  query: string;
  /** ISO 3166-1 alpha-2 (SHOPPING.country): only products that ship there. */
  country: string;
  /** ISO 4217 (SHOPPING.currency): results priced in any other currency are dropped, never converted. */
  currency: string;
  maxPriceCents?: number;
  limit: number;
}

export interface ProductLookupRequest {
  refs: ProductRef[];
  country: string;
  /** As on search: a ref now priced in another currency comes back in `notFound`. */
  currency: string;
}

/** `notFound`: refs the catalog no longer resolves (a watch then stops with `no_result`). */
export type ProductResults = IntegrationResult<{ products: Product[]; notFound: ProductRef[] }>;

export interface ProductCatalog {
  search(request: ProductSearchRequest): Promise<ProductResults>;
  /** Current details for refs (a variant ref returns that variant's price). Order follows `refs`. */
  lookup(request: ProductLookupRequest): Promise<ProductResults>;
}
