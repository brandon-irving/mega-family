// G4b (CONTRACT v0.16): our UCP platform ("agent") profile, served by convex/http.ts at SHOPPING.agentProfilePath.
// It's our declaration to any UCP business (Shopify's Global Catalog today), not vendor JSON, so it lives here
// rather than in an adapter. Shape from shopify.dev/docs/agents/profiles (Oct 28).
import { SHOPPING } from '../../shared/config/shopping';

/** The UCP platform profile we serve: catalog search + lookup and Shopify's Global Catalog extension (which
 * unlocks the enriched fields), nothing else — no cart, checkout or order capability (G4b invariant 4). Shape
 * from shopify.dev/docs/agents/profiles (the hosted fixture, trimmed to the catalog). */
export function agentProfile(): Record<string, unknown> {
  const v = SHOPPING.ucpVersion;
  const service = (name: string) => [{ version: v, spec: `https://ucp.dev/${v}/specification/overview`, transport: 'mcp', schema: `https://ucp.dev/${v}/services/${name}/mcp.openrpc.json` }];
  return {
    ucp: {
      version: v,
      services: { 'dev.ucp.shopping': service('shopping'), 'dev.ucp.common': service('common') },
      capabilities: {
        'dev.ucp.shopping.catalog.search': [{ version: v, spec: `https://ucp.dev/${v}/specification/catalog/search`, schema: `https://ucp.dev/${v}/schemas/shopping/catalog_search.json` }],
        'dev.ucp.shopping.catalog.lookup': [{ version: v, spec: `https://ucp.dev/${v}/specification/catalog/lookup`, schema: `https://ucp.dev/${v}/schemas/shopping/catalog_lookup.json` }],
        'dev.shopify.catalog.global': [
          {
            version: v,
            spec: 'https://shopify.dev/docs/agents/catalog/global-catalog',
            schema: `https://shopify.dev/ucp/schemas/${v}/shopify_catalog_global.json`,
            extends: ['dev.ucp.shopping.catalog.lookup', 'dev.ucp.shopping.catalog.search'],
          },
        ],
      },
      payment_handlers: {},
    },
  };
}

