// The real CalendarSource adapter (G5): read-only Google Calendar `events.list`. Docs re-checked Oct 29
// (developers.google.com/workspace/calendar/api/guides/sync): the full sync may be bounded (timeMin/timeMax) and
// pages with `nextPageToken`; `nextSyncToken` comes on the last page; an incremental request sends only the
// sync token (no timeMin/timeMax/orderBy/q…); "the server will respond to an incremental request with a
// response code 410. This should trigger a full wipe of the client's store and a new full sync." Deleted
// events come back `status: "cancelled"`. `singleEvents=true` expands recurring events into instances.
import { GOOGLE_CALENDAR } from '../../shared/config/google';
import type { ExternalEvent } from '../../shared/domain/integrationShapes';
import { addDays, zonedInstant } from '../../shared/time';
import type { CalendarSource } from '../ports/calendarSource';
import { googleGet, withQuery } from './googleHttp';

type Time = { dateTime?: string; date?: string; timeZone?: string };
type RawEvent = { id?: string; status?: string; summary?: string; location?: string; start?: Time; end?: Time };

/** One Google event → our shape in the family's timezone. All-day: `allDay` = the start date, `start` its local
 * midnight, `end` the (exclusive) end date's local midnight. A cancelled instance may come without times. */
export function toExternalEvent(e: RawEvent, timeZone: string): ExternalEvent | null {
  if (!e.id) return null;
  const cancelled = e.status === 'cancelled';
  const title = (e.summary ?? '').trim() || 'Busy';
  if (e.start?.date) {
    const start = zonedInstant(e.start.date, 0, timeZone);
    const end = e.end?.date ? zonedInstant(e.end.date, 0, timeZone) : zonedInstant(addDays(e.start.date, 1), 0, timeZone);
    return { externalId: e.id, title, start, end, allDay: e.start.date, location: e.location || undefined, cancelled };
  }
  const start = e.start?.dateTime ? Date.parse(e.start.dateTime) : NaN;
  if (!Number.isFinite(start)) return cancelled ? { externalId: e.id, title, start: 0, cancelled: true } : null;
  const endMs = e.end?.dateTime ? Date.parse(e.end.dateTime) : NaN;
  return { externalId: e.id, title, start, end: Number.isFinite(endMs) ? endMs : undefined, location: e.location || undefined, cancelled };
}

export const googleCalendarSource: CalendarSource = {
  async listEvents({ accessToken, calendarId, timeZone, syncToken, timeMin, timeMax, pageToken }) {
    const params = syncToken
      ? { singleEvents: true, syncToken, pageToken, maxResults: 250 }
      : {
          singleEvents: true,
          timeMin: timeMin !== undefined ? new Date(timeMin).toISOString() : undefined,
          timeMax: timeMax !== undefined ? new Date(timeMax).toISOString() : undefined,
          pageToken,
          maxResults: 250,
        };
    const r = await googleGet(withQuery(`${GOOGLE_CALENDAR.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events`, params), accessToken);
    if (!r.ok) {
      if (r.status === 410) return { ok: true, expired: true };
      return { ok: false, failure: r.failure, detail: r.detail };
    }
    const j = r.json as { items?: RawEvent[]; nextPageToken?: string; nextSyncToken?: string };
    const events = (j.items ?? []).map((e) => toExternalEvent(e, timeZone)).filter((e): e is ExternalEvent => !!e);
    return { ok: true, expired: false, events, nextPageToken: j.nextPageToken, nextSyncToken: j.nextSyncToken };
  },
};
