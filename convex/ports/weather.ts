// The Weather port (CONTRACT §8, G4): a forecast (Open-Meteo, no key) and active alerts (NWS, US only, needs a
// User-Agent — WEATHER.userAgent). Feature code reads normalized shapes only; `weatherCache.data` stores these.
//
// Open-Meteo (open-meteo.com/en/docs, Oct 28): GET /v1/forecast?latitude&longitude&hourly=…&daily=…&timezone=…
// &temperature_unit=fahrenheit&forecast_days=N; `weather_code` is a WMO code.
// NWS (weather.gov/documentation/services-web-api, Oct 28): GET https://api.weather.gov/alerts/active?point=
// {lat},{lng} with `Accept: application/geo+json`; each feature's `properties` has id, event, headline,
// severity (Extreme | Severe | Moderate | Minor | Unknown), onset/ends. Rate limit is unpublished but generous.
import type { ALERT_SEVERITIES } from '../../shared/config/ids';
import type { IntegrationResult, LatLng } from './integrationResult';

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface WeatherHour {
  at: number;
  tempF: number;
  /** Precipitation probability, 0–100. */
  precipPct: number;
  /** WMO weather code. */
  code: number;
}

export interface WeatherDay {
  /** "YYYY-MM-DD" in the requested time zone. */
  date: string;
  highF: number;
  lowF: number;
  precipPct: number;
  code: number;
}

/** `current` (v0.15a): Open-Meteo's current-conditions block, when the provider returns it. */
export type WeatherForecast = IntegrationResult<{ current?: { tempF: number; code: number }; hours: WeatherHour[]; days: WeatherDay[] }>;

export interface WeatherAlert {
  /** NWS alert id (stable across updates of the same alert; used in the candidate dedupeKey). */
  id: string;
  event: string;
  headline: string;
  severity: AlertSeverity;
  onset?: number;
  ends?: number;
}

export type WeatherAlerts = IntegrationResult<{ alerts: WeatherAlert[] }>;

export interface Weather {
  forecast(request: LatLng & { timezone: string; days: number }): Promise<WeatherForecast>;
  /** Active alerts at a point. Outside the US this returns `{ ok: true, alerts: [] }`. */
  alerts(request: LatLng): Promise<WeatherAlerts>;
}
