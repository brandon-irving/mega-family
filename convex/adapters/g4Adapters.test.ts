// G4 real integration adapters against recorded-shape fixtures and a fake `fetch` — never the network
// (docs/gates/G4.md backend task 1). Each fixture follows the provider's documented response (Oct 28).
import { afterEach, describe, expect, test, vi } from 'vitest';
import { mapboxDirections, mapboxGeocoder, parseDirections, parseGeocode } from './mapbox';
import { metaWebSearch, parseWebSearchResponse } from './metaWebSearch';
import { openMeteoNwsWeather, parseNwsAlerts, parseOpenMeteo } from './openMeteoNwsWeather';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ai.developer.meta.com/docs/search-grounding: output = web_search_call (+results with include) + message.
const META_RESPONSE = {
  output: [
    { type: 'web_search_call', status: 'completed', results: [{ type: 'text_result', title: 'Raw hit', url: 'https://example.org/raw' }, { type: 'text_result', title: 'Cited', url: 'https://kids.britannica.com/x' }] },
    { type: 'message', phase: 'commentary', content: [{ type: 'output_text', text: 'Searching…', annotations: [] }] },
    {
      type: 'message',
      content: [{ type: 'output_text', text: 'Octopuses have three hearts.', annotations: [{ type: 'url_citation', url: 'https://kids.britannica.com/x', title: 'Cited' }, { type: 'url_citation', url: 'javascript:alert(1)', title: 'bad' }] }],
    },
  ],
  usage: { input_tokens: 120, output_tokens: 40, input_tokens_details: { cached_tokens: 10 } },
};

describe('metaWebSearch', () => {
  test('posts web_search to /v1/responses with results included, approximate location and context size', async () => {
    vi.stubEnv('META_API_KEY', 'k');
    const fetchMock = vi.fn().mockResolvedValue(ok(META_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);
    const r = await metaWebSearch.search({ query: 'octopus hearts', contextSize: 'medium', approximateLocation: { city: 'Brooklyn', country: 'US' }, instructions: 'be brief' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/responses$/);
    const body = JSON.parse(init.body);
    expect(body.tools).toEqual([{ type: 'web_search', search_context_size: 'medium', user_location: { type: 'approximate', city: 'Brooklyn', country: 'US' } }]);
    expect(body.include).toEqual(['web_search_call.results']);
    expect(body.instructions).toBe('be brief');
    expect(r.ok && r.answer).toBe('Octopuses have three hearts.');
  });

  test('cited sources come first, deduped; commentary and non-http links are dropped; usage counts searches', () => {
    const r = parseWebSearchResponse(META_RESPONSE);
    if (!r.ok) throw new Error('expected ok');
    expect(r.answer).not.toContain('Searching');
    expect(r.sources.map((s) => s.url)).toEqual(['https://kids.britannica.com/x', 'https://example.org/raw']);
    expect(r.searched).toBe(true);
    expect(r.usage).toEqual({ tokensIn: 120, tokensOut: 40, cachedTokensIn: 10, searches: 1 });
  });

  test('fails closed: no key → not_configured, 429 → rate_limited, empty answer → no_result', async () => {
    expect(await metaWebSearch.search({ query: 'x', contextSize: 'low' })).toMatchObject({ ok: false, failure: 'not_configured' });
    vi.stubEnv('META_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    expect(await metaWebSearch.search({ query: 'x', contextSize: 'low' })).toMatchObject({ ok: false, failure: 'rate_limited' });
    expect(parseWebSearchResponse({ output: [] })).toMatchObject({ ok: false, failure: 'no_result' });
  });
});

describe('openMeteoNwsWeather', () => {
  test('forecast asks Open-Meteo for unixtime + fahrenheit in the family time zone and normalizes it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        hourly: { time: [1761670800], temperature_2m: [58.1], precipitation_probability: [70], weather_code: [61] },
        daily: { time: [1761624000], temperature_2m_max: [61], temperature_2m_min: [49], precipitation_probability_max: [80], weather_code: [63] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const r = await openMeteoNwsWeather.forecast({ lat: 40.674, lng: -73.97, timezone: 'America/New_York', days: 2 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('timeformat=unixtime');
    expect(url).toContain('temperature_unit=fahrenheit');
    expect(url).toContain('timezone=America%2FNew_York');
    expect(r).toEqual({ ok: true, hours: [{ at: 1761670800_000, tempF: 58.1, precipPct: 70, code: 61 }], days: [{ date: '2025-10-28', highF: 61, lowF: 49, precipPct: 80, code: 63 }] });
  });

  test('alerts send the NWS User-Agent and geo+json Accept; unknown severity maps to Unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ features: [{ properties: { id: 'urn:a1', event: 'Wind Advisory', headline: 'Wind Advisory until 6 PM', severity: 'Moderate', ends: '2026-10-29T22:00:00-04:00' } }, { properties: { id: 'urn:a2', event: 'Test', severity: 'Weird' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await openMeteoNwsWeather.alerts({ lat: 40.674, lng: -73.97 });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['User-Agent']).toMatch(/mega/);
    expect(init.headers.Accept).toBe('application/geo+json');
    if (!r.ok) throw new Error('expected ok');
    expect(r.alerts[0]).toMatchObject({ id: 'urn:a1', severity: 'Moderate', ends: Date.parse('2026-10-29T22:00:00-04:00') });
    expect(r.alerts[1].severity).toBe('Unknown');
  });

  test('a point outside NWS coverage is no alerts, not a failure; garbage is no_result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    expect(await openMeteoNwsWeather.alerts({ lat: 48.85, lng: 2.35 })).toEqual({ ok: true, alerts: [] });
    expect(parseNwsAlerts({})).toMatchObject({ ok: false, failure: 'no_result' });
    expect(parseOpenMeteo({}, 'UTC')).toMatchObject({ ok: false, failure: 'no_result' });
  });
});

describe('mapbox', () => {
  test('without MAPBOX_TOKEN both adapters fail closed and never call the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await mapboxDirections.travelTime({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, departAt: 'now' })).toMatchObject({ ok: false, failure: 'not_configured' });
    expect(await mapboxGeocoder.geocode({ address: 'x' })).toMatchObject({ ok: false, failure: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('directions: driving-traffic, lng,lat order, depart_at; minutes rounded; no route → no_result', async () => {
    vi.stubEnv('MAPBOX_TOKEN', 'tok');
    const fetchMock = vi.fn().mockResolvedValue(ok({ routes: [{ duration: 1080, duration_typical: 840, distance: 5400 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await mapboxDirections.travelTime({ from: { lat: 40.674, lng: -73.97 }, to: { lat: 40.6497, lng: -73.9682 }, departAt: Date.UTC(2026, 9, 29, 20, 30) });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/directions/v5/mapbox/driving-traffic/-73.97,40.674;-73.9682,40.6497');
    // Mapbox accepts YYYY-MM-DDThh:mm (local), hh:mm:ssZ or hh:mm:ss±hh:mm; "hh:mmZ" is a 422 (live, Oct 29).
    expect(url).toContain('depart_at=2026-10-29T20%3A30%3A00Z');
    expect(r).toEqual({ ok: true, minutes: 18, typicalMinutes: 14, distanceMeters: 5400 });
    expect(parseDirections({ routes: [] })).toMatchObject({ ok: false, failure: 'no_result' });
  });

  test('a provider error never echoes the token', async () => {
    vi.stubEnv('MAPBOX_TOKEN', 'secret-token-123');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const r = await mapboxGeocoder.geocode({ address: 'x' });
    expect(r).toMatchObject({ ok: false, failure: 'error' });
    expect(JSON.stringify(r)).not.toContain('secret-token-123');
  });

  test('geocode: permanent=true, country, proximity; coordinates come back lat/lng', async () => {
    vi.stubEnv('MAPBOX_TOKEN', 'tok');
    const fetchMock = vi.fn().mockResolvedValue(ok({ features: [{ geometry: { coordinates: [-73.9636, 40.6712] }, properties: { full_address: '200 Eastern Pkwy, Brooklyn, NY' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await mapboxGeocoder.geocode({ address: 'Brooklyn Museum', country: 'us', proximity: { lat: 40.67, lng: -73.97 } });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('permanent=true');
    expect(url).toContain('country=us');
    expect(url).toContain('proximity=-73.97%2C40.67');
    expect(r).toEqual({ ok: true, lat: 40.6712, lng: -73.9636, formatted: '200 Eastern Pkwy, Brooklyn, NY' });
    expect(parseGeocode({ features: [] })).toMatchObject({ ok: false, failure: 'no_result' });
  });
});
