// G4b real adapters against recorded-shape fixtures and a fake `fetch` — never the network. Fixture shapes are
// trimmed from live probes on Oct 28 (Shopify Global Catalog search + lookup, Open-Meteo air quality, Nager.Date
// 2026/US) and the providers' current docs.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SHOPPING } from '../../shared/config/shopping';
import { agentProfile } from '../model/ucpProfile';
import { nagerHolidays, parseHolidays } from './nagerHolidays';
import { openMeteoNwsWeather, parseAirQuality } from './openMeteoNwsWeather';
import { agentProfileUrl, parseLookup, parseSearch, shopifyCatalog } from './shopifyCatalog';

const VARIANT = 'gid://shopify/ProductVariant/46206824415461';
const PRODUCT = 'gid://shopify/p/4X7bq65dnMOpei2mTpC0pm';

/** Trimmed from the Oct 28 `search_catalog` probe ("dinosaur skeleton building set kids", max $45). */
const SEARCH_RESPONSE = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    structuredContent: {
      ucp: { version: '2026-08-25', capabilities: { 'dev.ucp.shopping.catalog.search': [{ version: '2026-08-25' }] } },
      products: [
        {
          id: PRODUCT,
          title: 'Toysmith BYO Dinosaur Skeleton',
          handle: 'toysmith-byo-dinosaur-skeleton',
          media: [{ type: 'image', url: 'https://cdn.shopify.com/s/files/dino.jpg', alt_text: 'Dinosaur skeleton kit' }],
          price_range: { min: { amount: 299, currency: 'USD' }, max: { amount: 299, currency: 'USD' } },
          variants: [
            {
              id: VARIANT,
              title: 'Toysmith BYO Dinosaur Skeleton',
              url: 'https://www.toysmith.com/products/toysmith-byo-dinosaur-skeleton?variant=46206824415461',
              price: { amount: 299, currency: 'USD' },
              list_price: { amount: 499, currency: 'USD' },
              availability: { available: true },
              seller: { id: 'gid://shopify/Shop/64560267493', name: 'Toysmith', url: 'https://www.toysmith.com' },
              checkout_url: 'https://checkout.example/cart/46206824415461:1',
            },
          ],
        },
        // Missing a price: dropped, never filled in.
        { id: 'gid://shopify/p/noprice', title: 'Mystery box', variants: [{ id: 'gid://shopify/ProductVariant/1', url: 'https://x.example/p', seller: { name: 'X' } }] },
      ],
      messages: [{ type: 'info', code: 'price_filter_applied', content: 'Price filtering was applied on a USD basis' }],
    },
  },
};

/** Trimmed from the Oct 28 `lookup_catalog` probe: the variant matched by `inputs`, a bogus id `not_found`. */
const LOOKUP_RESPONSE = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    structuredContent: {
      products: [
        {
          id: PRODUCT,
          title: 'Toysmith BYO Dinosaur Skeleton',
          variants: [
            {
              id: VARIANT,
              url: 'https://www.toysmith.com/products/toysmith-byo-dinosaur-skeleton?variant=46206824415461',
              price: { amount: 249, currency: 'USD' },
              availability: { available: false },
              seller: { name: 'Toysmith' },
              inputs: [{ id: VARIANT, match: 'exact' }],
            },
          ],
        },
      ],
      messages: [{ type: 'info', code: 'not_found', content: 'gid://shopify/ProductVariant/1' }],
    },
  },
};

type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[] = [];

function stubFetch(respond: (url: string) => { status: number; body: unknown }) {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = respond(url);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
}

const savedSite = process.env.CONVEX_SITE_URL;
beforeEach(() => {
  process.env.CONVEX_SITE_URL = 'https://example-site.convex.site';
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedSite === undefined) delete process.env.CONVEX_SITE_URL;
  else process.env.CONVEX_SITE_URL = savedSite;
});

describe('Shopify Global Catalog adapter', () => {
  test('search maps each product at its matched variant: price, compare-at, store, page url, image; incomplete products dropped', () => {
    const r = parseSearch(SEARCH_RESPONSE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.products).toEqual([
      {
        productId: PRODUCT,
        variantId: VARIANT,
        title: 'Toysmith BYO Dinosaur Skeleton',
        priceCents: 299,
        listPriceCents: 499,
        currency: 'USD',
        store: 'Toysmith',
        url: 'https://www.toysmith.com/products/toysmith-byo-dinosaur-skeleton?variant=46206824415461',
        imageUrl: 'https://cdn.shopify.com/s/files/dino.jpg',
        available: true,
      },
    ]);
    // Invariant 4: the checkout link is never carried anywhere.
    expect(JSON.stringify(r.products)).not.toContain('checkout');
  });

  test('lookup returns refs in order, matched by variant `inputs`; unresolved refs come back in notFound', () => {
    const r = parseLookup(LOOKUP_RESPONSE, [{ productId: 'gid://shopify/p/gone', variantId: 'gid://shopify/ProductVariant/1' }, { productId: PRODUCT, variantId: VARIANT }]);
    expect(r.ok && r.products.map((p) => [p.variantId, p.priceCents, p.available])).toEqual([[VARIANT, 249, false]]);
    expect(r.ok && r.notFound).toEqual([{ productId: 'gid://shopify/p/gone', variantId: 'gid://shopify/ProductVariant/1' }]);
  });

  test('the request is JSON-RPC tools/call with our agent profile, ships-to and price filters, and nothing about the asker', async () => {
    stubFetch(() => ({ status: 200, body: SEARCH_RESPONSE }));
    const r = await shopifyCatalog.search({ query: 'dinosaur kit', country: 'US', maxPriceCents: 4500, limit: 2 });
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe(SHOPPING.endpoint);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'search_catalog' } });
    expect(body.params.arguments.meta['ucp-agent'].profile).toBe(`https://example-site.convex.site${SHOPPING.agentProfilePath}`);
    expect(body.params.arguments.catalog).toEqual({
      query: 'dinosaur kit',
      filters: { ships_to: { country: 'US' }, available: true, price: { max: 4500 } },
      context: { address_country: 'US' },
      pagination: { limit: 2 },
    });
  });

  test('lookup sends variant ids (prices are per variant)', async () => {
    stubFetch(() => ({ status: 200, body: LOOKUP_RESPONSE }));
    await shopifyCatalog.lookup({ refs: [{ productId: PRODUCT, variantId: VARIANT }, { productId: 'gid://shopify/p/x' }], country: 'US' });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.params.name).toBe('lookup_catalog');
    expect(body.params.arguments.catalog).toEqual({ ids: [VARIANT, 'gid://shopify/p/x'], context: { address_country: 'US' } });
  });

  test('fails closed: no site URL → not_configured (no request); 422 profile error → error; 429 → rate_limited; RPC error → error', async () => {
    delete process.env.CONVEX_SITE_URL;
    stubFetch(() => ({ status: 200, body: SEARCH_RESPONSE }));
    expect(agentProfileUrl()).toBeNull();
    expect(await shopifyCatalog.search({ query: 'x', country: 'US', limit: 1 })).toMatchObject({ ok: false, failure: 'not_configured' });
    expect(calls.length).toBe(0);

    process.env.CONVEX_SITE_URL = 'https://example-site.convex.site';
    stubFetch(() => ({ status: 422, body: { jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'UCP discovery failed', data: { code: 'invalid_profile_url' } } } }));
    expect(await shopifyCatalog.search({ query: 'x', country: 'US', limit: 1 })).toMatchObject({ ok: false, failure: 'error' });
    stubFetch(() => ({ status: 429, body: {} }));
    expect(await shopifyCatalog.lookup({ refs: [{ productId: PRODUCT }], country: 'US' })).toMatchObject({ ok: false, failure: 'rate_limited' });
    stubFetch(() => ({ status: 200, body: { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bad params' } } }));
    expect(await shopifyCatalog.search({ query: 'x', country: 'US', limit: 1 })).toMatchObject({ ok: false, failure: 'error' });
  });

  test('our agent profile declares catalog search + lookup (and the Global Catalog extension) only: no cart, checkout or order', () => {
    const caps = Object.keys((agentProfile() as { ucp: { capabilities: Record<string, unknown> } }).ucp.capabilities);
    expect(caps.sort()).toEqual(['dev.shopify.catalog.global', 'dev.ucp.shopping.catalog.lookup', 'dev.ucp.shopping.catalog.search']);
    expect(JSON.stringify(agentProfile())).not.toMatch(/checkout|cart|order/);
    expect((agentProfile() as { ucp: { version: string } }).ucp.version).toBe(SHOPPING.ucpVersion);
  });
});

describe('Open-Meteo air quality', () => {
  const T0 = 1793239200; // epoch seconds, from the Oct 28 probe (America/New_York)
  const AIR = {
    current: { time: T0, us_aqi: 78, uv_index: 0 },
    hourly: { time: [T0, T0 + 3600, T0 + 7200, T0 + 86400], us_aqi: [58, 60, null, 40], uv_index: [1.65, 3.45, 2.75, 9] },
  };

  test('current AQI and UV, hourly points (nulls left out), and the first local day’s peak UV', () => {
    const air = parseAirQuality(AIR, 'America/New_York')!;
    expect(air).toMatchObject({ usAqi: 78, uvIndex: 0, uvIndexMax: 3.5 });
    expect(air.hourly![2]).toEqual({ at: (T0 + 7200) * 1000, uv: 2.8 });
  });

  test('the forecast carries `air` when the air call works, and simply omits it when that call fails', async () => {
    const forecast = { current: { time: T0, temperature_2m: 60, weather_code: 2 }, hourly: { time: [T0], temperature_2m: [60], precipitation_probability: [5], weather_code: [2] }, daily: { time: [T0], temperature_2m_max: [65], temperature_2m_min: [50], precipitation_probability_max: [5], weather_code: [2] } };
    stubFetch((url) => (url.includes('air-quality') ? { status: 200, body: AIR } : { status: 200, body: forecast }));
    const ok = await openMeteoNwsWeather.forecast({ lat: 40.67, lng: -73.97, timezone: 'America/New_York', days: 2 });
    expect(ok.ok && ok.air?.usAqi).toBe(78);
    const airCall = calls.find((c) => c.url.includes('air-quality'))!;
    expect(airCall.url).toContain('current=us_aqi%2Cuv_index');
    expect(airCall.url).not.toMatch(/pollen/);

    stubFetch((url) => (url.includes('air-quality') ? { status: 500, body: {} } : { status: 200, body: forecast }));
    const noAir = await openMeteoNwsWeather.forecast({ lat: 40.67, lng: -73.97, timezone: 'America/New_York', days: 2 });
    expect(noAir.ok).toBe(true);
    expect(noAir.ok && 'air' in noAir).toBe(false);
  });
});

describe('Nager.Date holidays', () => {
  const US_2026 = [
    { date: '2026-02-12', localName: "Lincoln's Birthday", name: "Lincoln's Birthday", countryCode: 'US', fixed: false, global: false, counties: ['US-CA', 'US-NY'], launchYear: null, types: ['Observance'] },
    { date: '2026-11-11', localName: 'Veterans Day', name: 'Veterans Day', countryCode: 'US', fixed: false, global: true, counties: null, launchYear: null, types: ['Public', 'Bank'] },
    { date: 'not a date', name: 'Bad row' },
  ];

  test('normalizes rows (regions only when listed), drops malformed ones', () => {
    const r = parseHolidays(US_2026);
    expect(r.ok && r.holidays).toEqual([
      { date: '2026-02-12', name: "Lincoln's Birthday", localName: "Lincoln's Birthday", global: false, regions: ['US-CA', 'US-NY'], types: ['Observance'] },
      { date: '2026-11-11', name: 'Veterans Day', localName: 'Veterans Day', global: true, types: ['Public', 'Bank'] },
    ]);
  });

  test('GET /PublicHolidays/{year}/{country}; an unknown country (404) is no_result', async () => {
    stubFetch(() => ({ status: 200, body: US_2026 }));
    await nagerHolidays.list({ year: 2026, country: 'us' });
    expect(calls[0].url).toBe('https://date.nager.at/api/v3/PublicHolidays/2026/US');
    stubFetch(() => ({ status: 404, body: {} }));
    expect(await nagerHolidays.list({ year: 2026, country: 'XX' })).toMatchObject({ ok: false, failure: 'no_result' });
  });
});
