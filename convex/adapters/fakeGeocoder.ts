// A scripted Geocoder for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`. Default: a fixed point
// (Grand Army Plaza, Brooklyn — a public landmark), so a new place always geocodes in tests.
import type { GeocodeRequest, GeocodeResult, Geocoder } from '../ports/geocoder';

export function makeFakeGeocoder(script?: (request: GeocodeRequest) => GeocodeResult): Geocoder & { requests: GeocodeRequest[] } {
  const requests: GeocodeRequest[] = [];
  return {
    requests,
    async geocode(request) {
      requests.push(request);
      if (script) return script(request);
      return { ok: true, lat: 40.674, lng: -73.97, formatted: request.address };
    },
  };
}

export const defaultFakeGeocoder: Geocoder = makeFakeGeocoder();
