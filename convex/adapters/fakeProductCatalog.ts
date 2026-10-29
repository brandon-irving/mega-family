// A scripted ProductCatalog for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`: no network, records
// every request (so a test can assert a gift query carried only household-shared facts). Default: two clearly
// fake products per search, and lookups that echo the refs back at a fixed price; tests script drops or misses.
import type { Product, ProductRef } from '../../shared/domain/integrationShapes';
import type { ProductCatalog, ProductLookupRequest, ProductResults, ProductSearchRequest } from '../ports/productCatalog';

function fakeProduct(ref: ProductRef, title: string, priceCents: number): Product {
  return { ...ref, title, priceCents, currency: 'USD', store: 'Example Toy Shop', url: 'https://example.com/products/fake', available: true };
}

export function makeFakeProductCatalog(script?: {
  search?: (request: ProductSearchRequest) => ProductResults;
  lookup?: (request: ProductLookupRequest) => ProductResults;
}): ProductCatalog & { searches: ProductSearchRequest[]; lookups: ProductLookupRequest[] } {
  const searches: ProductSearchRequest[] = [];
  const lookups: ProductLookupRequest[] = [];
  return {
    searches,
    lookups,
    async search(request) {
      searches.push(request);
      if (script?.search) return script.search(request);
      const products = [1, 2].slice(0, request.limit).map((n) => fakeProduct({ productId: `gid://shopify/p/fake${n}`, variantId: `gid://shopify/ProductVariant/fake${n}` }, `${request.query} (fake ${n})`, 2000 + n * 500));
      return { ok: true, products, notFound: [] };
    },
    async lookup(request) {
      lookups.push(request);
      if (script?.lookup) return script.lookup(request);
      return { ok: true, products: request.refs.map((ref) => fakeProduct(ref, 'Fake product', 2500)), notFound: [] };
    },
  };
}

export const defaultFakeProductCatalog: ProductCatalog = makeFakeProductCatalog();
