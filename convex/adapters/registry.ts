import { googleScheduling } from './googleScheduling';
import type { MailScheduling } from '../ports/mailScheduling';
// The one file that knows which adapter fills each model port (PLAN.md → Architecture "Rules":
// "`adapters/registry.ts` is the only file that knows which vendor fills each port"). Feature code
// (convex/agent/*, convex/talk.ts) imports `getChatModel()` / `getTranscriber()`, never an adapter directly.
//
// Selection, cheapest-safe-default first:
//   1. A test override installed via `__setChatModelForTests` / `__setTranscriberForTests` wins — this is
//      how unit tests script exact responses without any env-var dance.
//   2. `MEGA_MODEL_ADAPTER=real` selects the live Meta Model API adapters. This must be set explicitly
//      (by the live-check script, through the secrets runner) — there is no default that calls the network.
//   3. Otherwise, the Fake adapters. This is the safe default for `npx vitest run` and any other run that
//      doesn't opt in, so tests never hit the network by accident.
import { defaultFakeChatModel } from './fakeChatModel';
import { defaultFakeDirections } from './fakeDirections';
import { defaultFakeGeocoder } from './fakeGeocoder';
import { defaultFakeCalendarSource, defaultFakeGoogleOAuth, defaultFakeMailSource } from './fakeGoogle';
import { defaultFakeHolidays } from './fakeHolidays';
import { defaultFakeIcsFetcher } from './fakeIcsFetcher';
import { defaultFakeProductCatalog } from './fakeProductCatalog';
import { defaultFakePushSender } from './fakePushSender';
import { defaultFakeTranscriber } from './fakeTranscriber';
import { defaultFakeWeather } from './fakeWeather';
import { defaultFakeWebSearch } from './fakeWebSearch';
import { expoPushSender } from './expoPushSender';
import { logEmailSender } from './logEmailSender';
import { metaChatModel } from './metaChatModel';
import { metaTranscriber } from './metaTranscriber';
import { mapboxDirections, mapboxGeocoder } from './mapbox';
import { metaWebSearch } from './metaWebSearch';
import { openMeteoNwsWeather } from './openMeteoNwsWeather';
import { nagerHolidays } from './nagerHolidays';
import { gmailMailSource } from './gmail';
import { googleCalendarSource } from './googleCalendar';
import { googleOAuth } from './googleOAuth';
import { icsHttpFetcher } from './icsHttp';
import { shopifyCatalog } from './shopifyCatalog';
import { smartcarVehicles } from './smartcar';
import { defaultFakeVehicles } from './fakeVehicles';
import type { Vehicles } from '../ports/vehicles';
import type { ChatModel } from '../ports/chatModel';
import type { Directions } from '../ports/directions';
import type { EmailSender } from '../ports/emailSender';
import type { Geocoder } from '../ports/geocoder';
import type { CalendarSource } from '../ports/calendarSource';
import type { GoogleOAuth } from '../ports/googleOAuth';
import type { Holidays } from '../ports/holidays';
import type { IcsFetcher } from '../ports/icsFetcher';
import type { MailSource } from '../ports/mailSource';
import type { ProductCatalog } from '../ports/productCatalog';
import type { PushSender } from '../ports/pushSender';
import type { Transcriber } from '../ports/transcriber';
import type { Weather } from '../ports/weather';
import type { WebSearch } from '../ports/webSearch';

let chatOverride: ChatModel | null = null;
let transcriberOverride: Transcriber | null = null;
let pushSenderOverride: PushSender | null = null;
let emailSenderOverride: EmailSender | null = null;
let webSearchOverride: WebSearch | null = null;
let weatherOverride: Weather | null = null;
let directionsOverride: Directions | null = null;
let geocoderOverride: Geocoder | null = null;
let productCatalogOverride: ProductCatalog | null = null;
let holidaysOverride: Holidays | null = null;

function wantsRealAdapters(): boolean {
  return process.env.MEGA_MODEL_ADAPTER === 'real';
}

/** Whether this deployment talks to the real outside world (seed.resetDemo swaps sample data for live data). */
export function realAdaptersOn(): boolean {
  return wantsRealAdapters();
}

export function getChatModel(): ChatModel {
  if (chatOverride) return chatOverride;
  return wantsRealAdapters() ? metaChatModel : defaultFakeChatModel;
}

export function getTranscriber(): Transcriber {
  if (transcriberOverride) return transcriberOverride;
  return wantsRealAdapters() ? metaTranscriber : defaultFakeTranscriber;
}

/** Push isn't a model call (no spend, no cost concern), but it's still real-world I/O (an HTTP call to
 * Expo) that unit tests must never make by accident — same `wantsRealAdapters()` flag as the model
 * adapters, since it's the one env var that means "this deployment talks to the real outside world". */
export function getPushSender(): PushSender {
  if (pushSenderOverride) return pushSenderOverride;
  return wantsRealAdapters() ? expoPushSender : defaultFakePushSender;
}

/** Test-only: install a scripted ChatModel (see `fakeChatModel.ts`'s `makeFakeChatModel`). Pass `null` to
 * clear it — tests should always clear their override in an `afterEach` so it can't leak into another test. */
export function __setChatModelForTests(model: ChatModel | null): void {
  chatOverride = model;
}

/** Test-only: install a scripted Transcriber. Pass `null` to clear it. */
export function __setTranscriberForTests(transcriber: Transcriber | null): void {
  transcriberOverride = transcriber;
}

/** Test-only: install a scripted PushSender (see `fakePushSender.ts`'s `makeFakePushSender`). Pass `null`
 * to clear it. */
export function __setPushSenderForTests(sender: PushSender | null): void {
  pushSenderOverride = sender;
}

/** Password-reset email (Screen 9 redesign). No real provider is wired yet, so even with
 * MEGA_MODEL_ADAPTER=real this is the log adapter; a provider adapter goes here when one is chosen. */
export function getEmailSender(): EmailSender {
  return emailSenderOverride ?? logEmailSender;
}

/** Test-only: install a scripted EmailSender. Pass `null` to clear it. */
export function __setEmailSenderForTests(sender: EmailSender | null): void {
  emailSenderOverride = sender;
}

// ---------- G4 (CONTRACT v0.15): web search, weather, travel time, geocoding ----------
// Same selection as the model ports: test override → real (MEGA_MODEL_ADAPTER=real) → fake. The real adapters
// fail closed on their own (no key/token → `not_configured`), so real mode never shows a fake value.

export function getWebSearch(): WebSearch {
  if (webSearchOverride) return webSearchOverride;
  return wantsRealAdapters() ? metaWebSearch : defaultFakeWebSearch;
}

export function getWeather(): Weather {
  if (weatherOverride) return weatherOverride;
  return wantsRealAdapters() ? openMeteoNwsWeather : defaultFakeWeather;
}

export function getDirections(): Directions {
  if (directionsOverride) return directionsOverride;
  return wantsRealAdapters() ? mapboxDirections : defaultFakeDirections;
}

export function getGeocoder(): Geocoder {
  if (geocoderOverride) return geocoderOverride;
  return wantsRealAdapters() ? mapboxGeocoder : defaultFakeGeocoder;
}

/** Test-only: install scripted integration adapters (see the `makeFake*` helpers). Pass `null` to clear. */
export function __setWebSearchForTests(adapter: WebSearch | null): void {
  webSearchOverride = adapter;
}
export function __setWeatherForTests(adapter: Weather | null): void {
  weatherOverride = adapter;
}
export function __setDirectionsForTests(adapter: Directions | null): void {
  directionsOverride = adapter;
}
export function __setGeocoderForTests(adapter: Geocoder | null): void {
  geocoderOverride = adapter;
}

// ---------- G4b (CONTRACT v0.16): shopping, holidays ----------
// Same selection. The real adapters fail closed on their own (no agent profile URL → `not_configured`).

export function getProductCatalog(): ProductCatalog {
  if (productCatalogOverride) return productCatalogOverride;
  return wantsRealAdapters() ? shopifyCatalog : defaultFakeProductCatalog;
}

export function getHolidays(): Holidays {
  if (holidaysOverride) return holidaysOverride;
  return wantsRealAdapters() ? nagerHolidays : defaultFakeHolidays;
}

export function __setProductCatalogForTests(adapter: ProductCatalog | null): void {
  productCatalogOverride = adapter;
}
export function __setHolidaysForTests(adapter: Holidays | null): void {
  holidaysOverride = adapter;
}

// ---------- G5 (CONTRACT v0.17): Google (OAuth, Gmail, Calendar), schedule links ----------
// Same selection. The real Google adapters fail closed (`not_configured`) until GOOGLE_* + INTEGRATION_TOKEN_KEY
// are set on the deployment; real mode never falls back to a fake.

let googleOAuthOverride: GoogleOAuth | null = null;
let mailSourceOverride: MailSource | null = null;
let calendarSourceOverride: CalendarSource | null = null;
let icsFetcherOverride: IcsFetcher | null = null;

export function getGoogleOAuth(): GoogleOAuth {
  if (googleOAuthOverride) return googleOAuthOverride;
  return wantsRealAdapters() ? googleOAuth : defaultFakeGoogleOAuth;
}
export function getMailSource(): MailSource {
  if (mailSourceOverride) return mailSourceOverride;
  return wantsRealAdapters() ? gmailMailSource : defaultFakeMailSource;
}
export function getCalendarSource(): CalendarSource {
  if (calendarSourceOverride) return calendarSourceOverride;
  return wantsRealAdapters() ? googleCalendarSource : defaultFakeCalendarSource;
}
export function getIcsFetcher(): IcsFetcher {
  if (icsFetcherOverride) return icsFetcherOverride;
  return wantsRealAdapters() ? icsHttpFetcher : defaultFakeIcsFetcher;
}

export function __setGoogleOAuthForTests(adapter: GoogleOAuth | null): void {
  googleOAuthOverride = adapter;
}
export function __setMailSourceForTests(adapter: MailSource | null): void {
  mailSourceOverride = adapter;
}
export function __setCalendarSourceForTests(adapter: CalendarSource | null): void {
  calendarSourceOverride = adapter;
}
export function __setIcsFetcherForTests(adapter: IcsFetcher | null): void {
  icsFetcherOverride = adapter;
}

let schedulingOverride: MailScheduling | null = null;
const disabledScheduling: MailScheduling = { send: async () => ({ ok: false, uncertain: false }), watch: async () => null, hold: async () => ({ ok: false, uncertain: false }), draft: async () => ({ ok: false, uncertain: false }) };
export function getMailScheduling(): MailScheduling { return schedulingOverride ?? (wantsRealAdapters() ? googleScheduling : disabledScheduling); }
export function __setMailSchedulingForTests(value: MailScheduling | null) { schedulingOverride = value; }

// Vehicles addendum: connected cars (Smartcar). Same `wantsRealAdapters()` flag: tests and fake deployments never
// reach Smartcar by accident.
let vehiclesOverride: Vehicles | null = null;
export function getVehicles(): Vehicles {
  if (vehiclesOverride) return vehiclesOverride;
  return wantsRealAdapters() ? smartcarVehicles : defaultFakeVehicles;
}
export function __setVehiclesForTests(adapter: Vehicles | null): void {
  vehiclesOverride = adapter;
}
