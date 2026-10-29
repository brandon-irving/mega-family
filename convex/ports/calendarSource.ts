// The CalendarSource port (CONTRACT §8, G5 v0.17): read-only Google Calendar.
//
// Docs (developers.google.com/workspace/calendar/api, Oct 28): `GET https://www.googleapis.com/calendar/v3/
// calendars/{calendarId}/events` with `singleEvents=true`. Full sync: `timeMin`/`timeMax` (RFC 3339), follow
// `nextPageToken`; `nextSyncToken` is only on the last page. Incremental: `syncToken` (+ the same
// `singleEvents`), never with timeMin/timeMax/updatedMin/orderBy/q/iCalUID; deleted events come back with
// `status: "cancelled"`. An expired token → HTTP 410 Gone → clear and full-sync. Event times: `start.dateTime`
// (+ timeZone) or `start.date` for all-day (end date exclusive).
import type { ExternalEvent } from '../../shared/domain/integrationShapes';
import type { IntegrationResult } from './integrationResult';

export type CalendarPage = { events: ExternalEvent[]; nextPageToken?: string; nextSyncToken?: string };

export interface CalendarSource {
  /** `expired: true` = HTTP 410 on a sync token: the caller clears it and does a full sync. */
  listEvents(request: {
    accessToken: string;
    calendarId: string;
    timeZone: string;
    syncToken?: string;
    timeMin?: number;
    timeMax?: number;
    pageToken?: string;
  }): Promise<IntegrationResult<({ expired: false } & CalendarPage) | { expired: true }>>;
}
