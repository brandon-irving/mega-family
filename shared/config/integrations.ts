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
} as const;

export const TRAVEL = {
  directionsProvider: 'mapbox' as const,
  /** Mapbox Directions v5 profile with live + typical traffic (`duration_typical` comes back on this one). */
  profile: 'driving-traffic' as const,
  /** Leave by = event start − travel minutes − this buffer. */
  leaveByBufferMinutes: 10,
  /** Default origin when the event doesn't say where people come from. */
  defaultFrom: 'home' as PlaceKind,
  /** The leave-by reminder fires this many minutes before the leave-by time (Push board: "in 10 minutes"). */
  remindBeforeMinutes: 10,
  /** Start computing leave-by this far ahead (one Directions call per event and origin, kept in `travelChecks`). */
  lookaheadHours: 6,
  /** Re-check traffic for an upcoming event at most this often; the last check is reused otherwise. */
  recheckMinutes: 20,
  /** Skip a leave-by reminder when the trip is shorter than this (walking distance). */
  minTripMinutes: 5,
  timeoutMs: 10_000,
} as const;

/** What an integration that isn't set up tells the member (fail closed, never a made-up number). */
export const INTEGRATION_COPY = {
  travelNotConfigured: 'Travel time isn’t set up yet.',
  noPlace: 'I don’t know where that is yet. Add it under Family → Places.',
  weatherUnavailable: 'I can’t get the weather right now.',
  searchFailed: 'I couldn’t search right now. Try again in a bit?',
} as const;
