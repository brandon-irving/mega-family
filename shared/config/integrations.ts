// G4 (CONTRACT v0.15): web search, weather, travel time and family places. Providers sit behind ports
// (convex/ports/webSearch.ts, weather.ts, directions.ts, geocoder.ts); `convex/adapters/registry.ts` picks the
// adapter. Everything tunable about them lives here. External API facts are from the providers' current docs
// (Oct 28): Open-Meteo /v1/forecast, NWS api.weather.gov /alerts/active?point=, Mapbox Directions v5
// driving-traffic and Geocoding v6, Meta search grounding (`web_search` on /v1/responses).
import { PLACE_KINDS, type ALERT_SEVERITIES } from './ids';

type PlaceKind = (typeof PLACE_KINDS)[number];
type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** Family places: household data (every member can read them; adults add and edit). Home, school and work
 * are optional details (PLAN.md → Profiling; decided Oct 25: "only if given"). Addresses are typed, never the
 * phone's location (no expo-location; native packages are frozen). */
export const PLACES = {
  kinds: PLACE_KINDS,
  labels: { home: 'Home', school: 'School', work: 'Work', other: 'Place' } as Record<PlaceKind, string>,
  /** Roles that may add, edit or remove a place (`places.upsert` / `places.remove`). */
  editors: ['admin', 'adult'] as const,
  maxPerFamily: 12,
  maxLabelLength: 40,
  maxAddressLength: 200,
} as const;

export const GEOCODING = {
  provider: 'mapbox' as const,
  /** Mapbox Geocoding v6 `/search/geocode/v6/forward`. `permanent: true` is required because we store the
   * coordinates (temporary results may not be cached; permanent needs a card on the Mapbox account). */
  permanent: true,
  /** Bias and limit results to the family's country (ISO 3166 alpha-2). NWS alerts are US-only anyway. */
  country: 'us',
  /** Re-geocode a place whose lookup failed at most this often. */
  retryAfterHours: 24,
  /** How often the retry sweep runs (convex/crons.ts). A place stuck at `not_configured` is re-queued on every
   * sweep: without a token the adapter returns at once with no network call, and once MAPBOX_TOKEN is added
   * existing places heal on the next sweep instead of waiting a day. */
  retrySweepMinutes: 60,
  /** At most this many places are re-queued per sweep (the rest wait for the next one). */
  retryPerSweep: 50,
  /** The sweep reads at most this many places (families × PLACES.maxPerFamily stays far below it for now). */
  retryScanLimit: 2000,
} as const;

export const WEB_SEARCH = {
  /** `search_context_size` on the `web_search` tool: "low" | "medium" | "high" (Meta docs). */
  contextSize: 'medium' as const,
  /** Pass the family's approximate home city as `user_location` (type "approximate") for "near me" queries.
   * Only city/region/country/timezone — never an address or coordinates. */
  approximateLocation: true,
  /** Sources an adult's answer card shows at most. Kids: KID_SAFETY.search.maxSources. */
  maxSources: 5,
  /** Per member per day (rate limit, on top of the spend guard). */
  maxPerMemberPerDay: { adult: 40, kid: 15 },
  /** A search result is untrusted data (PLAN.md → Web search): it informs an answer, it never triggers a
   * tool call by itself. The agent may call at most this many searches per reply. */
  maxPerReply: 2,
  timeoutMs: 20_000,
} as const;

export const WEATHER = {
  forecastProvider: 'openMeteo' as const,
  alertsProvider: 'nws' as const,
  /** NWS requires a User-Agent identifying the app and a contact (api.weather.gov docs). */
  userAgent: '(mega.family app, hello@mega.family)',
  units: { temperature: 'fahrenheit', wind: 'mph', precipitation: 'inch' } as const,
  /** Open-Meteo hourly variables we ask for (all documented on open-meteo.com/en/docs). */
  current: ['temperature_2m', 'weather_code'] as const,
  hourly: ['temperature_2m', 'precipitation_probability', 'weather_code'] as const,
  daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'weather_code'] as const,
  forecastDays: 2,
  /** Cache lifetimes (`weatherCache.expiresAt`). Open-Meteo is free but we don't hammer it. */
  forecastTtlMinutes: 60,
  alertsTtlMinutes: 10,
  /** How often the cron refreshes alerts for each family's home (and every place with an event today). */
  alertsPollMinutes: 10,
  /** Severities that become a push (loudness below), vs. a quiet update in the thread/widget only. */
  pushSeverities: ['Extreme', 'Severe'] as const satisfies readonly AlertSeverity[],
  quietSeverities: ['Moderate'] as const satisfies readonly AlertSeverity[],
  /** Minor/Unknown alerts are dropped. Push loudness per severity (notifications.loudness). */
  alertLoudness: { Extreme: 'timeSensitive', Severe: 'timeSensitive', Moderate: 'passive' } as const,
  /** "Rain at pickup, grab the umbrellas": an event's weather tip when the hour it starts has at least this
   * precipitation probability. Goes through the normal judge (kind 'tip'). */
  eventRainThresholdPct: 60,
  /** Look this far ahead for events to check weather on. */
  eventLookaheadHours: 12,
  /** How many upcoming hours `weather.get` and the weather card show. */
  viewHours: 6,
  /** G4b (v0.16): air quality and UV from Open-Meteo's air-quality API (`air-quality-api.open-meteo.com/v1/
   * air-quality`, free, no key, same `latitude`/`longitude`/`timezone`). Fetched with the forecast and cached with
   * it; an air failure never fails the forecast (the card just has no air row). Pollen is Europe-only there
   * (CAMS Europe), so there is none. `uvIndexMax` is the max of today's hourly `uv_index`. */
  air: {
    url: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    current: ['us_aqi', 'uv_index'] as const,
    hourly: ['us_aqi', 'uv_index'] as const,
    forecastDays: 2,
  },
  /** Event tips (kind 'tip', same judge and dedupe as rain) for events at an `outdoor` place within
   * `eventLookaheadHours`: UV at the start hour ≥ `uvTipMin`, or US AQI at the start hour ≥ `aqiTipMin`. */
  uvTipMin: 6,
  aqiTipMin: 101,
  /** How a UV / air tip is delivered (both kind `tip`, passive): an air tip at or above this US AQI ("Unhealthy")
   * is a push; below it, and every UV tip, is a quiet statement (card in the thread + Today), Screen 15 boards. */
  airTipPushMinAqi: 151,
} as const;

/** G4b: US EPA AQI categories and WHO UV index bands, lower bound inclusive. Labels in G4B_COPY; colors are theme
 * tokens chosen by the app per level. */
export const AQI_LEVELS = [
  { min: 0, level: 'good' },
  { min: 51, level: 'moderate' },
  { min: 101, level: 'sensitive' },
  { min: 151, level: 'unhealthy' },
  { min: 201, level: 'veryUnhealthy' },
  { min: 301, level: 'hazardous' },
] as const;
export const UV_LEVELS = [
  { min: 0, level: 'low' },
  { min: 3, level: 'moderate' },
  { min: 6, level: 'high' },
  { min: 8, level: 'veryHigh' },
  { min: 11, level: 'extreme' },
] as const;

/** The band a value falls in (AQI_LEVELS / UV_LEVELS): the last band whose `min` it reaches. Used by the app's
 * tiles and the backend's weather sentence alike. */
export function levelOf<L extends string>(bands: readonly { min: number; level: L }[], value: number): L {
  let found = bands[0].level;
  for (const b of bands) if (value >= b.min) found = b.level;
  return found;
}

/** WMO weather codes (open-meteo.com/en/docs "WMO Weather interpretation codes") → the short words a card or
 * a reply uses. A code missing here reads as `WEATHER_SUMMARY_FALLBACK`. */
export const WEATHER_CODES: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorms',
  96: 'Thunderstorms with hail',
  99: 'Thunderstorms with hail',
};
export const WEATHER_SUMMARY_FALLBACK = 'Weather';

export const TRAVEL = {
  directionsProvider: 'mapbox' as const,
  /** Mapbox Directions v5 profile with live + typical traffic (`duration_typical` comes back on this one). */
  profile: 'driving-traffic' as const,
  /** Leave by = event start − travel minutes − this buffer. */
  leaveByBufferMinutes: 10,
  /** Default origin when the event doesn't say where people come from. */
  defaultFrom: 'home' as PlaceKind,
  /** v0.15a `travel.answer`: "Snooze 5 min", and "Remind me 30 min before" (the fallback when travel isn't set up). */
  snoozeMinutes: 5,
  remindBeforeEventMinutes: 30,
  /** The leave-by reminder fires this many minutes before the leave-by time (Push board: "in 10 minutes"). */
  remindBeforeMinutes: 10,
  /** Start computing leave-by this far ahead (one Directions call per event and origin, kept in `travelChecks`). */
  lookaheadHours: 6,
  /** Re-check traffic for an upcoming event at most this often; the last check is reused otherwise. */
  recheckMinutes: 20,
  /** Skip a leave-by reminder when the trip is shorter than this (walking distance). */
  minTripMinutes: 5,
  /** The first check for an event asks about departing this long before its start; later checks use the last
   * measured travel time instead (Mapbox `depart_at` = start − estimate). */
  firstEstimateMinutes: 20,
  timeoutMs: 10_000,
} as const;

/** What an integration that isn't set up tells the member (fail closed, never a made-up number). */
export const INTEGRATION_COPY = {
  travelNotConfigured: 'Travel time isn’t set up yet.',
  noPlace: 'I don’t know where that is yet. Add it under Family → Places.',
  weatherUnavailable: 'I can’t get the weather right now.',
  searchFailed: 'I couldn’t search right now. Try again in a bit?',
} as const;
