// A scripted IcsFetcher for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`: a synthetic team
// calendar (board OnboardIcs: "Soccer · Fall season"), one weekly practice plus a one-off game.
import type { IcsFetcher } from '../ports/icsFetcher';

export const FAKE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Example League//EN',
  'X-WR-CALNAME:Soccer · Fall season',
  'BEGIN:VEVENT',
  'UID:practice@example-league.test',
  'DTSTART;TZID=America/New_York:20261027T163000',
  'DTEND;TZID=America/New_York:20261027T173000',
  'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261124T235959Z',
  'SUMMARY:Practice',
  'LOCATION:Parade Ground\\, field 3',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:game1@example-league.test',
  'DTSTART;TZID=America/New_York:20261031T100000',
  'DTEND;TZID=America/New_York:20261031T113000',
  'SUMMARY:Game vs. Comets',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

export function makeFakeIcsFetcher(text: string = FAKE_ICS): IcsFetcher & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async fetch({ url }) {
      urls.push(url);
      if (url.includes('broken')) return { ok: false, failure: 'error' };
      return { ok: true, notModified: false, text, etag: '"v1"' };
    },
  };
}

export const defaultFakeIcsFetcher: IcsFetcher = makeFakeIcsFetcher();
