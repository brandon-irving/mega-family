// Registers the production proactive-engine sweep (PLAN.md -> Proactive engine). The demo's simulated
// clock (`clock.jump`) drives the exact same per-family tick synchronously instead of waiting for this
// interval — see `convex/model/proactive.ts` `tickFamilyLogic` and `convex/clock.ts`.
import { cronJobs } from 'convex/server';
import { PROACTIVE } from '../shared/config';
import { GEOCODING, TRAVEL, WEATHER } from '../shared/config/integrations';
import { HOLIDAYS, SHOPPING } from '../shared/config/shopping';
import { GMAIL, GOOGLE_CALENDAR, INTEGRATION_SYNC } from '../shared/config/google';
import { ICS, PROFILER } from '../shared/config/onboarding';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('proactive engine sweep', { minutes: PROACTIVE.sweepIntervalMinutes }, internal.proactive.tickAllFamilies, {});
// G4: weather (Open-Meteo + NWS alerts) and leave-by traffic checks, each family on its own schedule entry.
crons.interval('weather poll', { minutes: WEATHER.alertsPollMinutes }, internal.weather.pollAll, {});
crons.interval('leave-by traffic checks', { minutes: TRAVEL.recheckMinutes }, internal.travel.checkAll, {});
crons.interval('place geocode retries', { minutes: GEOCODING.retrySweepMinutes }, internal.places.retryGeocodes, {});
// G4b: gift-list price watches (Shopify Global Catalog lookups) and the public-holiday cache (Nager.Date).
crons.interval('price watch checks', { hours: SHOPPING.priceCheckHours }, internal.shopping.checkAll, {});
crons.interval('holiday cache refresh', { hours: HOLIDAYS.refreshDays * 24 }, internal.holidays.refreshAll, {});

// G5: connected accounts (each only for rows with a stored grant / link), OAuth state cleanup, the nightly profiler.
crons.interval('gmail poll', { minutes: GMAIL.pollMinutes }, internal.integrations.pollKind, { kind: 'gmail' });
crons.interval('google calendar poll', { minutes: GOOGLE_CALENDAR.pollMinutes }, internal.integrations.pollKind, { kind: 'googleCalendar' });
crons.interval('schedule link poll', { minutes: ICS.pollMinutes }, internal.integrations.pollKind, { kind: 'ics' });
crons.interval('oauth state cleanup', { minutes: INTEGRATION_SYNC.stateCleanupMinutes }, internal.integrations.cleanupStates, {});
crons.interval('nightly profiler sweep', { minutes: PROFILER.sweepMinutes }, internal.profiler.sweep, {});

export default crons;
