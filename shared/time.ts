// Time helpers that work in a family's IANA timezone using only Intl (available in Convex and React Native).
// Instants are ms since epoch; "YYYY-MM-DD" and minutes-after-midnight are local to the timezone.

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** The wall-clock fields of an instant in a timezone. */
export function localParts(at: number, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** Offset of the timezone from UTC at an instant, in ms (e.g. -4h for New York in October). */
function offsetAt(at: number, tz: string) {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant for a local date and minutes after midnight in a timezone. Handles DST changes. */
export function zonedInstant(date: string, minutes: number, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const first = guess - offsetAt(guess, tz);
  const second = guess - offsetAt(first, tz); // re-check in case the offset differs at the real instant
  return second;
}

/** "YYYY-MM-DD" for an instant in a timezone. */
export function localDate(at: number, tz: string): string {
  const p = localParts(at, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Adds whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Day of week for a "YYYY-MM-DD" date, 0 = Sunday. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
