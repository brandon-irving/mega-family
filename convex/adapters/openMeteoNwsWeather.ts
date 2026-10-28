// The real Weather adapter: Open-Meteo for the forecast (free, no key) and the US National Weather Service for
// active alerts (api.weather.gov, needs a User-Agent — WEATHER.userAgent). Docs read Oct 28:
// open-meteo.com/en/docs (`timeformat=unixtime` returns epoch seconds; daily rows start at local midnight in the
// requested `timezone`) and weather.gov/documentation/services-web-api (`/alerts/active?point=lat,lng`,
// `Accept: application/geo+json`). The only file that knows either vendor's JSON.
import { WEATHER } from '../../shared/config/integrations';
import { ALERT_SEVERITIES } from '../../shared/config/ids';
import { localDate } from '../../shared/time';
import type { AlertSeverity, Weather, WeatherAlert, WeatherAlerts, WeatherForecast } from '../ports/weather';
import { fetchJson } from './httpFetch';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const NWS = 'https://api.weather.gov/alerts/active';
const TIMEOUT_MS = 10_000;

export function openMeteoUrl(p: { lat: number; lng: number; timezone: string; days: number }): string {
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lng),
    current: WEATHER.current.join(','),
    hourly: WEATHER.hourly.join(','),
    daily: WEATHER.daily.join(','),
    timezone: p.timezone,
    temperature_unit: WEATHER.units.temperature,
    wind_speed_unit: WEATHER.units.wind,
    precipitation_unit: WEATHER.units.precipitation,
    forecast_days: String(p.days),
    timeformat: 'unixtime',
  });
  return `${OPEN_METEO}?${q.toString()}`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseOpenMeteo(json: unknown, timezone: string): WeatherForecast {
  const h = (json as { hourly?: Record<string, unknown[]> })?.hourly;
  const d = (json as { daily?: Record<string, unknown[]> })?.daily;
  if (!h?.time || !d?.time) return { ok: false, failure: 'no_result', detail: 'missing hourly/daily' };
  const hours = h.time.flatMap((t, i) => {
    const at = num(t);
    const tempF = num(h.temperature_2m?.[i]);
    const code = num(h.weather_code?.[i]);
    if (at === null || tempF === null || code === null) return [];
    return [{ at: at * 1000, tempF, precipPct: num(h.precipitation_probability?.[i]) ?? 0, code }];
  });
  const days = d.time.flatMap((t, i) => {
    const at = num(t);
    const highF = num(d.temperature_2m_max?.[i]);
    const lowF = num(d.temperature_2m_min?.[i]);
    const code = num(d.weather_code?.[i]);
    if (at === null || highF === null || lowF === null || code === null) return [];
    return [{ date: localDate(at * 1000, timezone), highF, lowF, precipPct: num(d.precipitation_probability_max?.[i]) ?? 0, code }];
  });
  const c = (json as { current?: Record<string, unknown> })?.current;
  const curTemp = num(c?.temperature_2m);
  const curCode = num(c?.weather_code);
  const curAt = num(c?.time);
  return { ok: true, ...(curTemp !== null && curCode !== null ? { current: { ...(curAt !== null ? { at: curAt * 1000 } : {}), tempF: curTemp, code: curCode } } : {}), hours, days };
}

const toMs = (v: unknown): number | undefined => {
  if (typeof v !== 'string') return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : undefined;
};

export function parseNwsAlerts(json: unknown): WeatherAlerts {
  const features = (json as { features?: { properties?: Record<string, unknown> }[] })?.features;
  if (!Array.isArray(features)) return { ok: false, failure: 'no_result', detail: 'missing features' };
  const alerts: WeatherAlert[] = features.flatMap((f) => {
    const p = f.properties ?? {};
    if (typeof p.id !== 'string' || typeof p.event !== 'string') return [];
    const severity = (ALERT_SEVERITIES as readonly string[]).includes(p.severity as string) ? (p.severity as AlertSeverity) : 'Unknown';
    return [{ id: p.id, event: p.event, headline: typeof p.headline === 'string' ? p.headline : p.event, severity, onset: toMs(p.onset), ends: toMs(p.ends) ?? toMs(p.expires) }];
  });
  return { ok: true, alerts };
}

export const openMeteoNwsWeather: Weather = {
  async forecast(request) {
    const res = await fetchJson(openMeteoUrl(request), { method: 'GET' }, TIMEOUT_MS);
    if (!res.ok) return { ok: false, failure: res.failure, detail: res.detail };
    return parseOpenMeteo(res.json, request.timezone);
  },
  async alerts(request) {
    const point = `${request.lat.toFixed(4)},${request.lng.toFixed(4)}`;
    const res = await fetchJson(`${NWS}?point=${point}`, { method: 'GET', headers: { Accept: 'application/geo+json', 'User-Agent': WEATHER.userAgent } }, TIMEOUT_MS);
    // NWS answers 400/404 for a point outside its coverage: no US alerts there, not a failure (port contract).
    if (!res.ok && (res.status === 400 || res.status === 404)) return { ok: true, alerts: [] };
    if (!res.ok) return { ok: false, failure: res.failure, detail: res.detail };
    return parseNwsAlerts(res.json);
  },
};
