// A scripted Weather for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`. Default: a mild,
// dry forecast and no alerts; tests pass `forecast` / `alerts` to script rain at pickup or a Severe alert.
import type { LatLng } from '../ports/integrationResult';
import type { Weather, WeatherAlerts, WeatherForecast } from '../ports/weather';

type ForecastRequest = LatLng & { timezone: string; days: number };

export function makeFakeWeather(script?: {
  forecast?: (request: ForecastRequest) => WeatherForecast;
  alerts?: (request: LatLng) => WeatherAlerts;
}): Weather & { forecasts: ForecastRequest[]; alertRequests: LatLng[] } {
  const forecasts: ForecastRequest[] = [];
  const alertRequests: LatLng[] = [];
  return {
    forecasts,
    alertRequests,
    async forecast(request) {
      forecasts.push(request);
      if (script?.forecast) return script.forecast(request);
      return { ok: true, hours: [], days: [] };
    },
    async alerts(request) {
      alertRequests.push(request);
      if (script?.alerts) return script.alerts(request);
      return { ok: true, alerts: [] };
    },
  };
}

export const defaultFakeWeather: Weather = makeFakeWeather();
