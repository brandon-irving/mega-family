// The IcsFetcher port (CONTRACT §8, G5 v0.17): downloads a schedule link (RFC 5545 text). Parsing is ours
// (convex/model/ics.ts, no package: a small subset — VEVENT, DTSTART/DTEND with TZID/UTC/VALUE=DATE, SUMMARY,
// LOCATION, UID, STATUS, RRULE FREQ=DAILY|WEEKLY|MONTHLY with INTERVAL/COUNT/UNTIL/BYDAY, EXDATE, RECURRENCE-ID,
// line unfolding). Conditional GET with the stored ETag / Last-Modified; `webcal://` is fetched as `https://`.
import type { IntegrationResult } from './integrationResult';

export interface IcsFetcher {
  fetch(request: { url: string; etag?: string; lastModified?: string; maxBytes: number; timeoutMs: number }): Promise<
    IntegrationResult<{ notModified: true } | { notModified: false; text: string; etag?: string; lastModified?: string }>
  >;
}
