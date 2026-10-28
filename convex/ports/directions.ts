// The Directions port (CONTRACT §8, G4): travel time between two saved places, for "leave by". Feature code
// never calls Mapbox directly.
//
// Mapbox Directions v5 (docs.mapbox.com/api/navigation/directions, Oct 28): GET /directions/v5/mapbox/
// driving-traffic/{lng},{lat};{lng},{lat}?access_token=…&depart_at=YYYY-MM-DDThh:mm:ssZ (or `depart_at=now`).
// `routes[0].duration` (seconds, traffic-aware), `duration_typical` (driving-traffic only), `distance` (m).
// Without MAPBOX_TOKEN the adapter returns `{ ok: false, failure: 'not_configured' }` (fail closed).
import type { IntegrationResult, LatLng } from './integrationResult';

export interface TravelTimeRequest {
  from: LatLng;
  to: LatLng;
  /** Departure instant (ms), or 'now' for live traffic. */
  departAt: number | 'now';
}

export type TravelTimeResult = IntegrationResult<{
  minutes: number;
  /** Traffic-free typical minutes, when the provider gives it. */
  typicalMinutes?: number;
  distanceMeters: number;
}>;

export interface Directions {
  travelTime(request: TravelTimeRequest): Promise<TravelTimeResult>;
}
