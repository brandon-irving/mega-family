import { describe, expect, test } from 'vitest';
import { addDays, dayOfWeek, formatLocalDateTime, localDate, localDateTimeToInstant, localParts, zonedInstant } from './time';

const NY = 'America/New_York';

describe('zonedInstant', () => {
  test('a normal October afternoon in New York is UTC-4', () => {
    expect(new Date(zonedInstant('2026-10-25', 16 * 60 + 50, NY)).toISOString()).toBe('2026-10-25T20:50:00.000Z');
  });

  test('after the November DST change it is UTC-5', () => {
    expect(new Date(zonedInstant('2026-11-02', 9 * 60, NY)).toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  test('round-trips through localParts for every hour across both DST changes', () => {
    for (const date of ['2026-03-08', '2026-11-01']) {
      for (let h = 0; h < 24; h++) {
        if (date === '2026-03-08' && h === 2) continue; // 2 AM doesn't exist that day
        const at = zonedInstant(date, h * 60 + 15, NY);
        const p = localParts(at, NY);
        expect([localDate(at, NY), p.hour, p.minute]).toEqual([date, h, 15]);
      }
    }
  });

  test('works in other timezones', () => {
    expect(new Date(zonedInstant('2026-10-25', 9 * 60, 'Asia/Tokyo')).toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(new Date(zonedInstant('2026-07-01', 0, 'Europe/London')).toISOString()).toBe('2026-06-30T23:00:00.000Z');
  });
});

describe('formatLocalDateTime', () => {
  test('long weekday (the system prompt\'s "Now:" line)', () => {
    expect(formatLocalDateTime(zonedInstant('2026-10-25', 16 * 60 + 42, NY), NY)).toBe('Sunday, Oct 25, 4:42 PM');
  });

  test('short weekday (events/reminders shown to the model)', () => {
    expect(formatLocalDateTime(zonedInstant('2026-10-25', 16 * 60 + 50, NY), NY, { weekday: 'short' })).toBe('Sun Oct 25, 4:50 PM');
  });

  test('reflects the timezone passed in, not the machine\'s local zone', () => {
    expect(formatLocalDateTime(zonedInstant('2026-10-25', 9 * 60, 'Asia/Tokyo'), 'Asia/Tokyo')).toBe('Sunday, Oct 25, 9:00 AM');
  });
});

describe('localDateTimeToInstant (model-facing tool time args)', () => {
  test('parses a normal local date-time the same as zonedInstant', () => {
    expect(localDateTimeToInstant('2026-10-25T16:50', NY)).toBe(zonedInstant('2026-10-25', 16 * 60 + 50, NY));
  });

  test('rejects a malformed string', () => {
    expect(() => localDateTimeToInstant('10/25/2026 4:50pm', NY)).toThrow();
    expect(() => localDateTimeToInstant('2026-10-25 16:50', NY)).toThrow(); // missing "T"
    expect(() => localDateTimeToInstant('2026-10-25T16:50:00', NY)).toThrow(); // seconds not allowed
  });

  test('rejects an impossible calendar date', () => {
    expect(() => localDateTimeToInstant('2026-02-30T10:00', NY)).toThrow(/no day/);
    expect(() => localDateTimeToInstant('2026-13-01T10:00', NY)).toThrow(/month/);
  });

  test('rejects an impossible time of day', () => {
    expect(() => localDateTimeToInstant('2026-10-25T24:00', NY)).toThrow(/hour/);
    expect(() => localDateTimeToInstant('2026-10-25T10:60', NY)).toThrow(/minute/);
  });

  test('DST fall-back: 2026-11-01T01:30 in America/New_York (the hour that happens twice) round-trips to 1:30', () => {
    const at = localDateTimeToInstant('2026-11-01T01:30', NY);
    const p = localParts(at, NY);
    expect([p.hour, p.minute]).toEqual([1, 30]);
  });

  test('DST spring-forward: 2026-03-08T02:30 in America/New_York (the hour that never happens) still produces a valid instant', () => {
    expect(() => localDateTimeToInstant('2026-03-08T02:30', NY)).not.toThrow();
  });
});

describe('date helpers', () => {
  test('addDays crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
  });

  test('dayOfWeek: Oct 25 2026 is a Sunday', () => {
    expect(dayOfWeek('2026-10-25')).toBe(0);
    expect(dayOfWeek('2026-10-31')).toBe(6);
  });
});
