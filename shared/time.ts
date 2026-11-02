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

const displayCache = new Map<string, Intl.DateTimeFormat>();
function displayFormatter(tz: string, weekday: 'long' | 'short') {
  const key = `${tz}|${weekday}`;
  let f = displayCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    displayCache.set(key, f);
  }
  return f;
}

/** A human, local-time rendering of an instant in a timezone: "Sunday, Oct 25, 4:42 PM" with the default
 * `weekday: 'long'` (used for the agent's "Now:" line), or "Sun Oct 25, 4:50 PM" with `weekday: 'short'`
 * (used for events/reminders shown to the model, e.g. "Mon Oct 26, 8:00 AM — School drop-off"). One
 * formatter so both read the same way instead of each caller rolling its own date math. */
export function formatLocalDateTime(at: number, tz: string, opts: { weekday?: 'long' | 'short' } = {}): string {
  const weekday = opts.weekday ?? 'long';
  const p = Object.fromEntries(displayFormatter(tz, weekday).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const sep = weekday === 'long' ? ', ' : ' ';
  // Some mobile Intl implementations return date-only parts for a combined formatter.
  // Keep the date, but derive missing time fields through the numeric wall-clock formatter.
  const time = p.hour && p.minute && p.dayPeriod ? `${p.hour}:${p.minute} ${p.dayPeriod}` : formatLocalTime(at, tz);
  const date = [p.weekday, [p.month, p.day].filter(Boolean).join(' ')].filter(Boolean).join(sep);
  return `${date || localDate(at, tz)}, ${time}`;
}

/** GD: "4:00 PM" — the local clock time of an instant (event previews, before/after cards). */
export function formatLocalTime(at: number, tz: string): string {
  const p = localParts(at, tz);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** G4: "2 PM" — the local hour of an instant (the weather card's hour strip). */
export function formatLocalHour(at: number, tz: string): string {
  const p = localParts(at, tz);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour12} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** GD: "Thu" — the local short weekday of an instant. */
export function formatLocalWeekday(at: number, tz: string): string {
  return SHORT_WEEKDAYS[dayOfWeek(localDate(at, tz))];
}

/** GD: "HH:MM" (24h, from config/routines/chores) → minutes after midnight, or null if malformed. */
export function parseClockTime(hm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const LOCAL_DATETIME_RE =/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Parses a tool-facing local date-time ("YYYY-MM-DDTHH:MM", the model's `events_create`/`events_update`/
 * `reminders_create` schema — convex/agent/toolSpecs.ts) into the instant it names in `tz`, validating both
 * the format and that the date/time actually exists (rejects Feb 30, hour 24, etc). A model computes epoch
 * ms badly, so tool args are local wall-clock strings instead; the public CONTRACT API (events.create etc.)
 * is unaffected and still takes ms. Throws a plain, short message a model can read and recover from.
 *
 * DST: a spring-forward gap (a local time that never happens, e.g. 2:30 AM on the day clocks jump to 3 AM)
 * still resolves to *some* instant via `zonedInstant`'s offset arithmetic, same as any other local time in
 * this module — it isn't rejected as "impossible" since, unlike an invalid calendar date, there's a
 * reasonable instant to return. A fall-back fold (a local time that happens twice, e.g. 1:30 AM on the day
 * clocks repeat) resolves to its first occurrence. */
export function localDateTimeToInstant(s: string, tz: string): number {
  const m = LOCAL_DATETIME_RE.exec(s);
  if (!m) throw new Error(`"${s}" isn't a valid local date-time — use "YYYY-MM-DDTHH:MM"`);
  const [, y, mo, d, h, mi] = m;
  const month = +mo;
  const day = +d;
  const hour = +h;
  const minute = +mi;
  if (month < 1 || month > 12) throw new Error(`"${s}": month must be 01-12`);
  if (hour > 23) throw new Error(`"${s}": hour must be 00-23`);
  if (minute > 59) throw new Error(`"${s}": minute must be 00-59`);
  const daysInMonth = new Date(Date.UTC(+y, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) throw new Error(`"${s}": "${y}-${mo}" has no day ${d}`);
  return zonedInstant(`${y}-${mo}-${d}`, hour * 60 + minute, tz);
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
