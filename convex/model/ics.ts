// G5: the RFC 5545 subset we read from schedule links (school and team calendars), no package (native and JS
// packages are frozen; this runs in Convex's default runtime and uses our DST-safe shared/time.ts). Supported:
// line unfolding; VEVENT with UID, SUMMARY, LOCATION, STATUS, DTSTART/DTEND (UTC "Z", TZID=, floating = the
// family's timezone, VALUE=DATE all-day); RRULE FREQ=DAILY|WEEKLY|MONTHLY with INTERVAL, COUNT, UNTIL, BYDAY
// (weekly days; monthly "2TU"/"-1FR"); EXDATE; RECURRENCE-ID overrides (and cancelled instances);
// X-WR-CALNAME. Recurrences are expanded only inside the given window and capped (ICS.maxOccurrencesPerRule,
// ICS.maxEvents). Anything else (VTODO, DURATION-only events, YEARLY, BYSETPOS…) is skipped, never guessed.
import { ICS } from '../../shared/config/onboarding';
import type { ExternalEvent } from '../../shared/domain/integrationShapes';
import { addDays, dayOfWeek, localDate, localParts, zonedInstant } from '../../shared/time';

type Prop = { name: string; params: Record<string, string>; value: string };
type Stamp = { at: number; allDay?: string; local?: { date: string; minutes: number; tz: string } };
type RawEvent = {
  uid?: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: Stamp;
  end?: Stamp;
  rrule?: string;
  exdates: Stamp[];
  recurrenceId?: Stamp;
};

/** Joins folded lines (a CRLF/LF followed by a space or tab continues the previous line). */
export function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n').filter((l) => l.length > 0);
}

/** `NAME;P=v;Q="v:x":VALUE` → { name, params, value }. Quoted params may contain ':' and ';'. */
export function parseLine(line: string): Prop | null {
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ':' && !inQuote) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts: string[] = [];
  let cur = '';
  inQuote = false;
  for (const c of head) {
    if (c === '"') inQuote = !inQuote;
    if (c === ';' && !inQuote) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

/** TEXT unescaping (\\ \; \, \n). */
export function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

function validTz(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** One DATE or DATE-TIME value → an instant (and, for local times, the local date/time for recurrence math). */
export function parseStamp(value: string, params: Record<string, string>, familyTz: string): Stamp | null {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || params.VALUE === 'DATE') {
    if (!date) return null;
    const d = `${date[1]}-${date[2]}-${date[3]}`;
    return { at: zonedInstant(d, 0, familyTz), allDay: d };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!dt) return null;
  const d = `${dt[1]}-${dt[2]}-${dt[3]}`;
  const minutes = Number(dt[4]) * 60 + Number(dt[5]);
  if (Number(dt[2]) < 1 || Number(dt[2]) > 12 || Number(dt[3]) < 1 || Number(dt[3]) > 31 || Number(dt[4]) > 23 || Number(dt[5]) > 59) return null;
  if (dt[7]) return { at: Date.UTC(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5], +(dt[6] ?? 0)) };
  const tz = validTz(params.TZID) ? params.TZID : familyTz; // floating or an unknown (e.g. Windows) zone name
  return { at: zonedInstant(d, minutes, tz), local: { date: d, minutes, tz } };
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

type Rule = { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number; count?: number; until?: number; byDay: { n?: number; day: number }[] };

export function parseRule(rrule: string, familyTz: string): Rule | null {
  const fields = Object.fromEntries(rrule.split(';').map((kv) => kv.split('=') as [string, string]).map(([k, v]) => [k?.toUpperCase(), v]));
  const freq = fields.FREQ?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;
  if (fields.BYSETPOS || fields.BYMONTHDAY || fields.BYYEARDAY || fields.BYWEEKNO || fields.BYHOUR) return null; // outside our subset: skip, never guess
  const interval = Math.max(1, Number(fields.INTERVAL ?? 1) || 1);
  const count = fields.COUNT ? Math.max(0, Number(fields.COUNT) || 0) : undefined;
  const untilStamp = fields.UNTIL ? parseStamp(fields.UNTIL, {}, familyTz) : null;
  // A date-only UNTIL includes that whole day.
  const until = untilStamp ? (untilStamp.allDay ? zonedInstant(addDays(untilStamp.allDay, 1), 0, familyTz) - 1 : untilStamp.at) : undefined;
  const byDay: Rule['byDay'] = [];
  for (const token of (fields.BYDAY ?? '').split(',').filter(Boolean)) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(token.trim());
    if (!m) return null;
    byDay.push({ n: m[1] ? Number(m[1]) : undefined, day: WEEKDAY_CODES.indexOf(m[2].toUpperCase() as (typeof WEEKDAY_CODES)[number]) });
  }
  return { freq, interval, count, until, byDay };
}

function monthAdd(date: string, months: number): { y: number; m: number } {
  const [y, m] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The nth (1-based; negative counts from the end) `day` (0=Sunday) of a month, or null. */
function nthWeekday(y: number, m: number, n: number, day: number): string | null {
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) if (dayOfWeek(ymd(y, m, d)) === day) dates.push(ymd(y, m, d));
  const pick = n > 0 ? dates[n - 1] : dates[dates.length + n];
  return pick ?? null;
}

/** Local dates of a rule's occurrences, in order, from the start date up to `lastDate`, at most `max`
 * (counting from the first occurrence, so COUNT is honored even when early ones are outside the window). */
export function occurrenceDates(startDate: string, rule: Rule, lastDate: string, max: number): string[] {
  const out: string[] = [];
  const limit = rule.count !== undefined ? Math.min(rule.count, max) : max;
  const push = (d: string) => {
    if (d < startDate || d > lastDate || out.length >= limit) return;
    out.push(d);
  };
  let guard = 0;
  if (rule.freq === 'DAILY') {
    for (let d = startDate; d <= lastDate && out.length < limit && guard++ < 10_000; d = addDays(d, rule.interval)) push(d);
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byDay.length ? [...new Set(rule.byDay.map((b) => b.day))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) : [dayOfWeek(startDate)];
    // Weeks start on Monday (RFC 5545's default WKST).
    const weekStart = addDays(startDate, -((dayOfWeek(startDate) + 6) % 7));
    for (let w = weekStart; w <= lastDate && out.length < limit && guard++ < 10_000; w = addDays(w, 7 * rule.interval)) {
      for (const day of days) push(addDays(w, (day + 6) % 7));
    }
  } else {
    const startDay = Number(startDate.slice(8, 10));
    for (let i = 0; out.length < limit && guard++ < 1_000; i += rule.interval) {
      const { y, m } = monthAdd(startDate, i);
      if (ymd(y, m, 1) > lastDate) break;
      const candidates = rule.byDay.length
        ? rule.byDay.flatMap((b) => (b.n !== undefined ? [nthWeekday(y, m, b.n, b.day)] : Array.from({ length: daysInMonth(y, m) }, (_, k) => ymd(y, m, k + 1)).filter((d) => dayOfWeek(d) === b.day))).filter((d): d is string => !!d).sort()
        : startDay <= daysInMonth(y, m)
          ? [ymd(y, m, startDay)]
          : [];
      for (const d of candidates) push(d);
    }
  }
  return out;
}

function readEvents(lines: string[], familyTz: string): { label?: string; events: RawEvent[] } {
  let label: string | undefined;
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let depth = 0; // nested components inside a VEVENT (VALARM) are ignored
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      if (p.value.toUpperCase() === 'VEVENT' && !cur) cur = { exdates: [] };
      else if (cur) depth++;
      continue;
    }
    if (p.name === 'END') {
      if (cur && depth > 0) depth--;
      else if (cur && p.value.toUpperCase() === 'VEVENT') {
        events.push(cur);
        cur = null;
      }
      continue;
    }
    if (!cur) {
      if (p.name === 'X-WR-CALNAME' && p.value.trim()) label = unescapeText(p.value.trim());
      continue;
    }
    if (depth > 0) continue;
    switch (p.name) {
      case 'UID':
        cur.uid = p.value.trim();
        break;
      case 'SUMMARY':
        cur.summary = unescapeText(p.value).trim();
        break;
      case 'LOCATION':
        cur.location = unescapeText(p.value).trim();
        break;
      case 'STATUS':
        cur.status = p.value.trim().toUpperCase();
        break;
      case 'DTSTART':
        cur.start = parseStamp(p.value, p.params, familyTz) ?? undefined;
        break;
      case 'DTEND':
        cur.end = parseStamp(p.value, p.params, familyTz) ?? undefined;
        break;
      case 'RRULE':
        cur.rrule = p.value.trim();
        break;
      case 'EXDATE':
        for (const v of p.value.split(',')) {
          const s = parseStamp(v, p.params, familyTz);
          if (s) cur.exdates.push(s);
        }
        break;
      case 'RECURRENCE-ID':
        cur.recurrenceId = parseStamp(p.value, p.params, familyTz) ?? undefined;
        break;
    }
  }
  return { label, events };
}

/** The key an occurrence is matched by (EXDATE, RECURRENCE-ID): its date for all-day, else its instant. */
function occurrenceKey(s: Stamp): string {
  return s.allDay ?? String(s.at);
}

/** Parses a feed and expands it into the window: one ExternalEvent per occurrence, `externalId` =
 * `uid` (single) or `uid#<date or instant>` (recurring). Cancelled overrides remove their occurrence. */
export function parseIcs(text: string, opts: { familyTz: string; windowStart: number; windowEnd: number }): { label?: string; events: ExternalEvent[] } {
  const { familyTz, windowStart, windowEnd } = opts;
  const { label, events: raw } = readEvents(unfold(text), familyTz);
  const overrides = new Map<string, RawEvent>();
  for (const e of raw) if (e.uid && e.recurrenceId) overrides.set(`${e.uid}#${occurrenceKey(e.recurrenceId)}`, e);

  const out: ExternalEvent[] = [];
  const add = (e: ExternalEvent) => {
    if (out.length >= ICS.maxEvents) return;
    if (e.start > windowEnd || (e.end ?? e.start) < windowStart) return;
    out.push(e);
  };
  const toEvent = (e: RawEvent, externalId: string, start: Stamp, end: Stamp | undefined): ExternalEvent => ({
    externalId,
    title: e.summary || 'Busy',
    start: start.at,
    end: end?.at ?? (start.allDay ? zonedInstant(addDays(start.allDay, 1), 0, familyTz) : undefined),
    allDay: start.allDay,
    location: e.location || undefined,
    cancelled: false,
  });

  for (const e of raw) {
    if (!e.uid || !e.start || e.recurrenceId) continue;
    if (!e.rrule) {
      if (e.status !== 'CANCELLED') add(toEvent(e, e.uid, e.start, e.end));
      continue;
    }
    const rule = parseRule(e.rrule, familyTz);
    if (!rule) continue;
    const startLocal = e.start.allDay ? { date: e.start.allDay, minutes: 0, tz: familyTz } : (e.start.local ?? { date: localDate(e.start.at, 'UTC'), minutes: localParts(e.start.at, 'UTC').hour * 60 + localParts(e.start.at, 'UTC').minute, tz: 'UTC' });
    const duration = e.end ? e.end.at - e.start.at : undefined;
    const lastDate = localDate(windowEnd, startLocal.tz);
    const excluded = new Set(e.exdates.map(occurrenceKey));
    for (const d of occurrenceDates(startLocal.date, rule, lastDate, ICS.maxOccurrencesPerRule)) {
      const at = zonedInstant(d, startLocal.minutes, startLocal.tz);
      if (rule.until !== undefined && at > rule.until) break;
      const stamp: Stamp = e.start.allDay ? { at, allDay: d } : { at };
      const key = occurrenceKey(stamp);
      if (excluded.has(key)) continue;
      const override = overrides.get(`${e.uid}#${key}`);
      if (override) {
        if (override.status !== 'CANCELLED' && override.start) add(toEvent({ ...e, ...override, exdates: [] }, `${e.uid}#${key}`, override.start, override.end));
        continue;
      }
      if (e.status === 'CANCELLED') continue;
      add(toEvent(e, `${e.uid}#${key}`, stamp, duration !== undefined ? { at: at + duration } : undefined));
    }
  }
  return { label, events: out };
}
