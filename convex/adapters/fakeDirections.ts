// A scripted Directions for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`. Default: 18 minutes
// (typical 14), so leave-by math is easy to assert; tests script `not_configured` or `no_result` to check the
// fail-closed paths.
import type { Directions, TravelTimeRequest, TravelTimeResult } from '../ports/directions';

export function makeFakeDirections(script?: (request: TravelTimeRequest) => TravelTimeResult): Directions & { requests: TravelTimeRequest[] } {
  const requests: TravelTimeRequest[] = [];
  return {
    requests,
    async travelTime(request) {
      requests.push(request);
      if (script) return script(request);
      return { ok: true, minutes: 18, typicalMinutes: 14, distanceMeters: 6400 };
    },
  };
}

export const defaultFakeDirections: Directions = makeFakeDirections();
