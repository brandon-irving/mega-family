// G4 (CONTRACT v0.15): the result shape every integration port returns. Integrations fail closed: a missing
// secret, no route or a provider error comes back as `{ ok: false, failure }` (never a thrown vendor error and
// never a made-up value), so feature code can always show INTEGRATION_COPY instead of guessing.
import type { INTEGRATION_FAILURES } from '../../shared/config/ids';

export type IntegrationFailure = (typeof INTEGRATION_FAILURES)[number];

export type IntegrationResult<T> = ({ ok: true } & T) | { ok: false; failure: IntegrationFailure; detail?: string };

/** A point on the map (WGS84). Longitude second, as everywhere in our code; adapters reorder for vendors. */
export interface LatLng {
  lat: number;
  lng: number;
}
