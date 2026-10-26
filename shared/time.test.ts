import { describe, expect, test } from 'vitest';
import { addDays, dayOfWeek, localDate, localParts, zonedInstant } from './time';

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
