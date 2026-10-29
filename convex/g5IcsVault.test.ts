// G5: the schedule-link parser (convex/model/ics.ts, our RFC 5545 subset) and the token vault
// (convex/model/tokenVault.ts, AES-GCM under INTEGRATION_TOKEN_KEY). Pure functions; no Convex runtime.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { zonedInstant } from '../shared/time';
import { FAKE_ICS } from './adapters/fakeIcsFetcher';
import { parseIcs, parseRule, unfold } from './model/ics';
import { decryptToken, encryptToken, tokenKeyPresent } from './model/tokenVault';

const TZ = 'America/New_York';
const at = (date: string, h: number, m = 0, tz = TZ) => zonedInstant(date, h * 60 + m, tz);
const window = { familyTz: TZ, windowStart: at('2026-10-18', 0), windowEnd: at('2026-12-31', 0) };
const cal = (...events: string[][]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

describe('ics: the RFC 5545 subset', () => {
  test('the sample team feed: title from X-WR-CALNAME, weekly TU/TH practice until Nov 24 at 4:30 PM local across the Nov 1 DST change, one game', () => {
    const { label, events } = parseIcs(FAKE_ICS, window);
    expect(label).toBe('Soccer · Fall season');
    const practices = events.filter((e) => e.title === 'Practice');
    expect(practices.map((e) => e.externalId.split('#')[1])).toHaveLength(9); // Oct 27 … Nov 24, Tue+Thu
    expect(practices[0]).toMatchObject({ start: at('2026-10-27', 16, 30), end: at('2026-10-27', 17, 30), location: 'Parade Ground, field 3', cancelled: false });
    // After the clocks change (Nov 1) it's still 4:30 PM local, not 3:30.
    const nov3 = practices.find((e) => e.start === at('2026-11-03', 16, 30));
    expect(nov3).toBeDefined();
    expect(practices.at(-1)!.start).toBe(at('2026-11-24', 16, 30));
    expect(events.find((e) => e.title === 'Game vs. Comets')).toMatchObject({ externalId: 'game1@example-league.test', start: at('2026-10-31', 10) });
  });

  test('EXDATE removes an occurrence; RECURRENCE-ID moves one; a cancelled override removes it', () => {
    const text = cal(
      ['UID:r1', 'DTSTART;TZID=America/New_York:20261026T080000', 'DTEND;TZID=America/New_York:20261026T083000', 'RRULE:FREQ=DAILY;COUNT=5', 'EXDATE;TZID=America/New_York:20261027T080000', 'SUMMARY:Bus'],
      ['UID:r1', 'RECURRENCE-ID;TZID=America/New_York:20261028T080000', 'DTSTART;TZID=America/New_York:20261028T090000', 'DTEND;TZID=America/New_York:20261028T093000', 'SUMMARY:Bus (late start)'],
      ['UID:r1', 'RECURRENCE-ID;TZID=America/New_York:20261029T080000', 'DTSTART;TZID=America/New_York:20261029T080000', 'STATUS:CANCELLED', 'SUMMARY:Bus'],
    );
    const { events } = parseIcs(text, window);
    expect(events.map((e) => [e.title, e.start])).toEqual([
      ['Bus', at('2026-10-26', 8)],
      ['Bus (late start)', at('2026-10-28', 9)],
      ['Bus', at('2026-10-30', 8)],
    ]);
  });

  test('all-day (VALUE=DATE), UTC and floating times; monthly "2nd Tuesday"; folded lines and escapes', () => {
    const text = cal(
      ['UID:a', 'DTSTART;VALUE=DATE:20261111', 'SUMMARY:No school\\, Veterans Day'],
      ['UID:u', 'DTSTART:20261102T230000Z', 'DTEND:20261102T233000Z', 'SUMMARY:UTC call'],
      ['UID:f', 'DTSTART:20261103T190000', 'SUMMARY:PTA meet', ' ing'],
      ['UID:m', 'DTSTART;TZID=America/New_York:20261013T190000', 'RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3', 'SUMMARY:Board'],
    );
    const { events } = parseIcs(unfold(text).join('\r\n'), window);
    const byId = Object.fromEntries(events.map((e) => [e.externalId.split('#')[0], e]));
    expect(byId.a).toMatchObject({ title: 'No school, Veterans Day', allDay: '2026-11-11', start: at('2026-11-11', 0), end: at('2026-11-12', 0) });
    expect(byId.u.start).toBe(Date.UTC(2026, 10, 2, 23));
    expect(byId.f).toMatchObject({ title: 'PTA meeting', start: at('2026-11-03', 19) });
    expect(events.filter((e) => e.externalId.startsWith('m#')).map((e) => e.start)).toEqual([at('2026-10-13', 19), at('2026-11-10', 19), at('2026-12-08', 19)].filter((s) => s >= window.windowStart));
  });

  test('rules outside the subset are skipped, never guessed; expansion is bounded by the window', () => {
    expect(parseRule('FREQ=YEARLY', TZ)).toBeNull();
    expect(parseRule('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR', TZ)).toBeNull();
    const forever = cal(['UID:d', 'DTSTART;TZID=America/New_York:20260101T070000', 'RRULE:FREQ=DAILY', 'SUMMARY:Daily']);
    const { events } = parseIcs(forever, window);
    expect(events.every((e) => e.start >= window.windowStart && e.start < window.windowEnd)).toBe(true);
    expect(events.length).toBeLessThanOrEqual(200);
  });

  test('an event without a UID or start is ignored; nothing throws on garbage', () => {
    expect(parseIcs(cal(['SUMMARY:No uid', 'DTSTART:20261101T100000']), window).events).toEqual([]);
    expect(parseIcs('garbage\r\nBEGIN:VEVENT\r\nDTSTART:2026\r\nEND:VEVENT', window).events).toEqual([]);
  });
});

describe('tokenVault (AES-GCM under INTEGRATION_TOKEN_KEY)', () => {
  const key = (c: string) => btoa(c.repeat(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  beforeEach(() => {
    process.env.INTEGRATION_TOKEN_KEY = key('a');
  });
  afterEach(() => {
    delete process.env.INTEGRATION_TOKEN_KEY;
  });

  test('round trip; the ciphertext never contains the token and differs every time (fresh IV)', async () => {
    const a = await encryptToken('1//refresh-token-value');
    const b = await encryptToken('1//refresh-token-value');
    expect(a).not.toContain('refresh-token-value');
    expect(a).not.toBe(b);
    expect(await decryptToken(a)).toBe('1//refresh-token-value');
  });

  test('another key, a tampered byte or a malformed value decrypt to null (never a throw)', async () => {
    const sealed = await encryptToken('t');
    process.env.INTEGRATION_TOKEN_KEY = key('b');
    expect(await decryptToken(sealed)).toBeNull();
    process.env.INTEGRATION_TOKEN_KEY = key('a');
    const [v, iv, ct] = sealed.split('.');
    const flipped = `${v}.${iv}.${ct.slice(0, -2)}${ct.at(-2) === 'A' ? 'B' : 'A'}${ct.at(-1)}`;
    expect(await decryptToken(flipped)).toBeNull();
    expect(await decryptToken('nonsense')).toBeNull();
  });

  test('a missing or short key means Google is not configured', () => {
    delete process.env.INTEGRATION_TOKEN_KEY;
    expect(tokenKeyPresent()).toBe(false);
    process.env.INTEGRATION_TOKEN_KEY = key('a').slice(0, 20);
    expect(tokenKeyPresent()).toBe(false);
  });
});
