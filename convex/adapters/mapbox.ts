// The real Directions and Geocoder adapters: Mapbox Directions v5 (`mapbox/driving-traffic`) and Geocoding v6
// (`/search/geocode/v6/forward`, `permanent=true` because we store the coordinates). Docs read Oct 28:
// docs.mapbox.com/api/navigation/directions and docs.mapbox.com/api/search/geocoding. Without MAPBOX_TOKEN both
// fail closed with `not_configured` (never a made-up minute or coordinate). The token is never logged: it rides
// in the URL, so failures report only the HTTP status (adapters/httpFetch.ts).
import { GEOCODING, TRAVEL } from '../../shared/config/integrations';
import type { Directions, TravelTimeResult } from '../ports/directions';
import type { GeocodeResult, Geocoder } from '../ports/geocoder';
import { fetchJson } from './httpFetch';

const BASE = 'https://api.mapbox.com';

function token(): string | null {
  const t = process.env.MAPBOX_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

/** Mapbox `depart_at` in UTC: "YYYY-MM-DDThh:mm:ssZ". Mapbox accepts "hh:mm" only without a zone (local to
 * the start), so "hh:mmZ" is rejected with a 422 (found live, Oct 29). Seconds are zeroed. */
export function departAtParam(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16)}:00Z`;
}

export function directionsUrl(p: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; departAt: number | 'now' }, accessToken: string): string {
  const coords = `${p.from.lng},${p.from.lat};${p.to.lng},${p.to.lat}`;
  const q = new URLSearchParams({ access_token: accessToken, overview: 'false', alternatives: 'false' });
  if (p.departAt !== 'now') q.set('depart_at', departAtParam(p.departAt));
  return `${BASE}/directions/v5/mapbox/${TRAVEL.profile}/${coords}?${q.toString()}`;
}

export function parseDirections(json: unknown): TravelTimeResult {
  const route = (json as { routes?: { duration?: number; duration_typical?: number; distance?: number }[] })?.routes?.[0];
  if (!route || typeof route.duration !== 'number') return { ok: false, failure: 'no_result', detail: 'no route' };
  return {
    ok: true,
    minutes: Math.max(1, Math.round(route.duration / 60)),
    typicalMinutes: typeof route.duration_typical === 'number' ? Math.max(1, Math.round(route.duration_typical / 60)) : undefined,
    distanceMeters: Math.round(route.distance ?? 0),
  };
}

export function geocodeUrl(p: { address: string; country?: string; proximity?: { lat: number; lng: number } }, accessToken: string): string {
  const q = new URLSearchParams({ q: p.address, limit: '1', permanent: String(GEOCODING.permanent), access_token: accessToken });
  if (p.country) q.set('country', p.country);
  if (p.proximity) q.set('proximity', `${p.proximity.lng},${p.proximity.lat}`);
  return `${BASE}/search/geocode/v6/forward?${q.toString()}`;
}

export function parseGeocode(json: unknown): GeocodeResult {
  const f = (json as { features?: { geometry?: { coordinates?: number[] }; properties?: { full_address?: string; name?: string } }[] })?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (!f || !Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return { ok: false, failure: 'no_result', detail: 'no match' };
  return { ok: true, lng: c[0], lat: c[1], formatted: f.properties?.full_address ?? f.properties?.name ?? '' };
}

export const mapboxDirections: Directions = {
  async travelTime(request) {
    const t = token();
    if (!t) return { ok: false, failure: 'not_configured', detail: 'MAPBOX_TOKEN is not set' };
    const res = await fetchJson(directionsUrl(request, t), { method: 'GET' }, TRAVEL.timeoutMs);
    if (!res.ok) return { ok: false, failure: res.failure, detail: res.detail };
    return parseDirections(res.json);
  },
};

export const mapboxGeocoder: Geocoder = {
  async geocode(request) {
    const t = token();
    if (!t) return { ok: false, failure: 'not_configured', detail: 'MAPBOX_TOKEN is not set' };
    const res = await fetchJson(geocodeUrl(request, t), { method: 'GET' }, TRAVEL.timeoutMs);
    if (!res.ok) return { ok: false, failure: res.failure, detail: res.detail };
    return parseGeocode(res.json);
  },
};
