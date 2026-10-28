// The Geocoder port (CONTRACT §8, G4): a typed address → coordinates, for family places. Never the phone's
// location (no expo-location; native packages are frozen).
//
// Mapbox Geocoding v6 (docs.mapbox.com/api/search/geocoding, Oct 28): GET /search/geocode/v6/forward?q=…
// &country=us&limit=1&permanent=true&access_token=…. `permanent=true` because we store the result (temporary
// results may not be cached). Without MAPBOX_TOKEN the adapter returns `{ ok: false, failure: 'not_configured' }`.
import type { IntegrationResult, LatLng } from './integrationResult';

export interface GeocodeRequest {
  address: string;
  /** ISO 3166 alpha-2 (GEOCODING.country). */
  country?: string;
  /** Bias toward results near here (e.g. the family's home). */
  proximity?: LatLng;
}

export type GeocodeResult = IntegrationResult<LatLng & { /** The provider's standardized address. */ formatted: string }>;

export interface Geocoder {
  geocode(request: GeocodeRequest): Promise<GeocodeResult>;
}
