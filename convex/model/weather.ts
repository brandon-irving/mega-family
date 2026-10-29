// Weather (G4, CONTRACT v0.15): the cache → view, the cache write, and the two weather triggers (NWS alerts and
// rain at an upcoming event). The network side lives in `convex/weather.ts` (actions); everything here runs in a
// query or mutation so it can read the family's data and enqueue candidates in one transaction.
//
// Invariant 7 (fail closed, never made up): a view only ever shows numbers that came from the Weather port.
// Invariant 8 (alerts don't spam): one candidate per (NWS alert id × recipient); Extreme/Severe push
// (time-sensitive), Moderate is a quiet statement, Minor/Unknown are dropped; kids never get alert pushes
// (`update` isn't a kid kind), the adults do.
import { WEATHER, WEATHER_CODES, WEATHER_SUMMARY_FALLBACK } from '../../shared/config/integrations';
import { NOTIFICATION_KINDS_CONFIG } from '../../shared/config/notifications';
import { G4B_COPY, fillCopy } from '../../shared/config/copy';
import { weatherAlertDedupeKey, weatherEventDedupeKey, weatherTipDedupeKey } from '../../shared/config/proactive';
import type { WeatherView } from '../../shared/domain/api';
import { formatLocalTime, localDate } from '../../shared/time';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { AlertSeverity, WeatherAir, WeatherAlert, WeatherDay, WeatherHour } from '../ports/weather';
import { finalizeCandidateLogic, insertCandidateIfNew } from './proactive';
import { eventOwnerId, layerOf } from './visibility';

type Ctx = QueryCtx | MutationCtx;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type ForecastData = { current?: { at?: number; tempF: number; code: number }; hours: WeatherHour[]; days: WeatherDay[]; air?: WeatherAir };
export type AlertsData = { alerts: WeatherAlert[] };

export function summaryFor(code: number): string {
  return WEATHER_CODES[code] ?? WEATHER_SUMMARY_FALLBACK;
}

export async function cacheRow(ctx: Ctx, familyId: Id<'families'>, placeId: Id<'places'>, kind: 'forecast' | 'alerts'): Promise<Doc<'weatherCache'> | null> {
  return ctx.db
    .query('weatherCache')
    .withIndex('by_family_place_kind', (q) => q.eq('familyId', familyId).eq('placeId', placeId).eq('kind', kind))
    .unique();
}

/** True when this kind of cache for the place is missing or past its TTL (a refresh should fetch it). */
export async function cacheIsStale(ctx: Ctx, familyId: Id<'families'>, placeId: Id<'places'>, kind: 'forecast' | 'alerts', now: number): Promise<boolean> {
  const row = await cacheRow(ctx, familyId, placeId, kind);
  return !row || row.expiresAt <= now;
}

/** Active alerts in a cache row: not ended yet, and only severities we'd show (Minor/Unknown are dropped). */
export function activeAlerts(data: AlertsData | null | undefined, now: number): WeatherAlert[] {
  const shown = new Set<AlertSeverity>([...WEATHER.pushSeverities, ...WEATHER.quietSeverities]);
  return (data?.alerts ?? []).filter((a) => shown.has(a.severity) && (a.ends === undefined || a.ends > now));
}

/** `weather.get`'s view for one place, from the cache only. */
export async function buildWeatherView(ctx: Ctx, place: Doc<'places'>, tz: string, now: number): Promise<WeatherView> {
  const forecast = await cacheRow(ctx, place.familyId, place._id, 'forecast');
  const alerts = await cacheRow(ctx, place.familyId, place._id, 'alerts');
  const data = forecast && !forecast.failure ? (forecast.data as ForecastData) : null;
  // Weather is real-world data on real time. When the family's clock (the demo's simulated one) falls outside
  // the forecast, read it at the forecast's own "now" (Open-Meteo's current block, else when it was fetched)
  // rather than showing the wrong day's hours.
  const span = data?.hours.length ? { from: data.hours[0].at, to: data.hours[data.hours.length - 1].at + HOUR } : null;
  const at = span && (now < span.from || now >= span.to) ? (data?.current?.at ?? forecast?.fetchedAt ?? now) : now;
  const hours = (data?.hours ?? []).filter((h) => h.at + HOUR > at).slice(0, WEATHER.viewHours);
  // Open-Meteo's own current block when we have it (v0.15a), else the hour we're in.
  const current = data?.current ?? hours[0] ?? null;
  const today = data?.days.find((d) => d.date === localDate(at, tz)) ?? null;
  return {
    placeId: place._id,
    placeLabel: place.label,
    fetchedAt: forecast?.fetchedAt ?? null,
    stale: !forecast || forecast.expiresAt <= now,
    ...(forecast?.failure && !data ? { failure: forecast.failure } : {}),
    now: current ? { tempF: Math.round(current.tempF), code: current.code, summary: summaryFor(current.code) } : null,
    hours: hours.map((h) => ({ at: h.at, tempF: Math.round(h.tempF), precipPct: Math.round(h.precipPct), code: h.code })),
    today: today ? { highF: Math.round(today.highF), lowF: Math.round(today.lowF), precipPct: Math.round(today.precipPct), code: today.code } : null,
    alerts: activeAlerts(alerts && !alerts.failure ? (alerts.data as AlertsData) : null, now).map((a) => ({ id: a.id, event: a.event, headline: a.headline, severity: a.severity, ends: a.ends })),
    ...airView(data?.air, at, tz),
  };
}

/** G4b: the air row for a view read at `at` — that hour's AQI and UV when the hourly data covers it (else
 * Open-Meteo's current block), and the day's peak UV. Only numbers the provider gave; nothing → no row. */
export function airView(air: WeatherAir | undefined, at: number, tz: string): { air?: { usAqi?: number; uvIndex?: number; uvIndexMax?: number } } {
  if (!air) return {};
  const hour = airAt(air, at);
  const usAqi = hour?.usAqi ?? air.usAqi;
  const uvIndex = hour?.uv ?? air.uvIndex;
  const day = localDate(at, tz);
  const uvs = (air.hourly ?? []).filter((x) => x.uv !== undefined && localDate(x.at, tz) === day).map((x) => x.uv!);
  const uvIndexMax = uvs.length ? Math.max(...uvs) : air.uvIndexMax;
  const out = { ...(usAqi !== undefined ? { usAqi } : {}), ...(uvIndex !== undefined ? { uvIndex } : {}), ...(uvIndexMax !== undefined ? { uvIndexMax } : {}) };
  return Object.keys(out).length ? { air: out } : {};
}

/** The hourly air point covering `at`, if any. */
export function airAt(air: WeatherAir | undefined, at: number): { usAqi?: number; uv?: number } | null {
  return air?.hourly?.find((h) => h.at <= at && at < h.at + HOUR) ?? null;
}

/** One sentence for the agent's reply / a card summary. Never includes a number the view doesn't have. */
export function weatherSentence(view: WeatherView): string {
  if (!view.now) return '';
  const parts = [`${view.placeLabel}: ${view.now.summary}, ${view.now.tempF}°F`];
  if (view.today) parts.push(`high ${view.today.highF}°, low ${view.today.lowF}°, ${view.today.precipPct}% chance of rain today`);
  const alert = view.alerts[0];
  if (alert) parts.push(`${alert.event} in effect`);
  return parts.join('; ') + '.';
}

/** Writes one cache row (replacing the previous one). A failure keeps the last good data and records the
 * failure only when there is no good data to keep — a blip doesn't erase a forecast that is still useful. */
export async function writeCache(
  ctx: MutationCtx,
  p: { familyId: Id<'families'>; placeId: Id<'places'>; kind: 'forecast' | 'alerts'; now: number; result: { ok: true; data: ForecastData | AlertsData } | { ok: false; failure: Doc<'weatherCache'>['failure'] & string } },
): Promise<void> {
  const ttl = (p.kind === 'forecast' ? WEATHER.forecastTtlMinutes : WEATHER.alertsTtlMinutes) * MINUTE;
  const existing = await cacheRow(ctx, p.familyId, p.placeId, p.kind);
  const row = p.result.ok
    ? { fetchedAt: p.now, expiresAt: p.now + ttl, failure: undefined, data: p.result.data }
    : existing && !existing.failure
      ? { expiresAt: p.now + ttl } // keep the last good data; try again after the TTL
      : { fetchedAt: p.now, expiresAt: p.now + ttl, failure: p.result.failure, data: null };
  if (existing) await ctx.db.patch(existing._id, row);
  else await ctx.db.insert('weatherCache', { familyId: p.familyId, placeId: p.placeId, kind: p.kind, fetchedAt: p.now, data: null, ...row });
}

async function adultsWithLogin(ctx: MutationCtx, familyId: Id<'families'>): Promise<Doc<'members'>[]> {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  return members.filter((x) => x.role !== 'kid' && !!x.authId);
}

/** New NWS alerts → candidates (invariant 8) and a `weather.alert` family event. */
export async function alertTriggers(ctx: MutationCtx, p: { familyId: Id<'families'>; place: Doc<'places'>; alerts: WeatherAlert[]; now: number }): Promise<void> {
  const adults = await adultsWithLogin(ctx, p.familyId);
  for (const a of activeAlerts({ alerts: p.alerts }, p.now)) {
    const push = (WEATHER.pushSeverities as readonly string[]).includes(a.severity);
    let anyNew = false;
    for (const adult of adults) {
      const candidateId = await insertCandidateIfNew(ctx, {
        familyId: p.familyId,
        recipientId: adult._id,
        kind: 'update',
        dedupeKey: weatherAlertDedupeKey(a.id, adult._id),
        draftText: a.headline,
        window: { from: p.now, to: a.ends ?? p.now + 6 * HOUR },
        source: { kind: 'weatherAlert', alertId: a.id, placeId: p.place._id },
      });
      if (!candidateId) continue;
      anyNew = true;
      // The alert's own words are the message: no model call, nothing to embellish (deterministic, like a request).
      await finalizeCandidateLogic(ctx, { candidateId, kind: 'update', title: a.event, text: a.headline, score: 1, reason: `NWS ${a.severity} alert`, forcedDelivery: push ? 'push' : 'statement' });
    }
    if (anyNew) {
      await ctx.db.insert('familyEvents', {
        familyId: p.familyId,
        at: p.now,
        type: 'weather.alert',
        payload: { alertId: a.id, placeId: p.place._id, event: a.event, severity: a.severity },
        processed: { memory: true, profiler: true, triggers: true },
      });
    }
  }
}

/** Who hears about rain at an event: its owner for a private event (if an adult); otherwise the adults in its
 * `who`, or — for a kids-only event like soccer practice — the kids' parents. Never kids (`tip` isn't a kid kind). */
async function weatherRecipients(ctx: MutationCtx, event: Doc<'events'>): Promise<Id<'members'>[]> {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', event.familyId))
    .collect();
  const byId = new Map(members.map((x) => [x._id, x]));
  const isAdult = (id: Id<'members'>) => {
    const x = byId.get(id);
    return !!x && x.role !== 'kid' && !!x.authId;
  };
  if (layerOf(event) === 'private') {
    const owner = eventOwnerId(event);
    return owner && isAdult(owner) ? [owner] : [];
  }
  const adults = event.who.filter(isAdult);
  if (adults.length) return adults;
  const kids = new Set(event.who.filter((id) => byId.get(id)?.role === 'kid'));
  if (!kids.size) return [];
  const rels = await ctx.db
    .query('relationships')
    .withIndex('by_family_from', (q) => q.eq('familyId', event.familyId))
    .collect();
  return [...new Set(rels.filter((r) => r.kind === 'parent' && kids.has(r.to) && isAdult(r.from)).map((r) => r.from))];
}

/** Rain at an upcoming event at this place → a `tip` candidate per recipient, drafted by the normal judge.
 * G4b: at an `outdoor` place, high UV or poor air at the event's start → a deterministic `uv` / `air` tip (one
 * per event × tip × recipient × day; household events go to the adults, a private one only to its owner). */
export async function eventWeatherTriggers(ctx: MutationCtx, p: { familyId: Id<'families'>; place: Doc<'places'>; tz: string; hours: WeatherHour[]; air?: WeatherAir; now: number }): Promise<void> {
  const events = await ctx.db
    .query('events')
    .withIndex('by_family_start', (q) => q.eq('familyId', p.familyId).gte('start', p.now).lte('start', p.now + WEATHER.eventLookaheadHours * HOUR))
    .collect();
  for (const event of events) {
    if (event.cancelled || event.placeId !== p.place._id || event.allDay) continue;
    const recipients = await weatherRecipients(ctx, event);
    const date = localDate(event.start, p.tz);
    const hour = p.hours.find((h) => h.at <= event.start && event.start < h.at + HOUR);
    if (hour && hour.precipPct >= WEATHER.eventRainThresholdPct) {
      for (const recipientId of recipients) {
        const candidateId = await insertCandidateIfNew(ctx, {
          familyId: p.familyId,
          recipientId,
          kind: 'tip',
          dedupeKey: weatherEventDedupeKey(event._id, recipientId, date),
          draftText: `${Math.round(hour.precipPct)}% chance of ${summaryFor(hour.code).toLowerCase()} around ${formatLocalTime(event.start, p.tz)} for "${event.title}" at ${p.place.label}.`,
          window: { from: p.now, to: event.start },
          source: { kind: 'weatherEvent', eventId: event._id },
        });
        if (candidateId) await ctx.scheduler.runAfter(0, internal.proactive.processCandidate, { candidateId });
      }
    }
    if (p.place.outdoor) await airTips(ctx, { familyId: p.familyId, air: p.air, now: p.now, event, recipients, date });
  }
}

/** G4b invariant 8: the UV / air tips for one outdoor event. The words are config (G4B_COPY), the numbers the
 * provider's, so there's no model call: a quiet statement, except an air tip at WEATHER.airTipPushMinAqi or
 * worse, which pushes (passive, `tip`). */
async function airTips(
  ctx: MutationCtx,
  p: { familyId: Id<'families'>; air?: WeatherAir; now: number; event: Doc<'events'>; recipients: Id<'members'>[]; date: string },
): Promise<void> {
  const point = airAt(p.air, p.event.start);
  const tips: { tip: 'uv' | 'air'; text: string; push: boolean; reason: string }[] = [];
  if (point?.uv !== undefined && point.uv >= WEATHER.uvTipMin) tips.push({ tip: 'uv', text: fillCopy(G4B_COPY.tipUv, { event: p.event.title }), push: false, reason: `UV ${point.uv} at the start` });
  if (point?.usAqi !== undefined && point.usAqi >= WEATHER.aqiTipMin) {
    tips.push({ tip: 'air', text: fillCopy(G4B_COPY.tipAir, { event: p.event.title }), push: point.usAqi >= WEATHER.airTipPushMinAqi, reason: `US AQI ${point.usAqi} at the start` });
  }
  for (const t of tips) {
    for (const recipientId of p.recipients) {
      const candidateId = await insertCandidateIfNew(ctx, {
        familyId: p.familyId,
        recipientId,
        kind: 'tip',
        dedupeKey: weatherTipDedupeKey(p.event._id, t.tip, recipientId, p.date),
        draftText: t.text,
        window: { from: p.now, to: p.event.start },
        source: { kind: 'weatherEvent', eventId: p.event._id, tip: t.tip },
      });
      if (!candidateId) continue;
      await finalizeCandidateLogic(ctx, { candidateId, kind: 'tip', title: p.event.title, text: t.text, score: 1, reason: t.reason, forcedDelivery: t.push ? 'push' : 'statement' });
    }
  }
}

type ThreadCard = Extract<Doc<'messages'>['body'], { type: 'card' }>['card'];

/** G4b: the `weather` card a UV / air tip posts in the recipient's thread (CONTRACT §3 v0.16 `tip`, `air`),
 * built from the place's cached forecast at delivery time. Null for rain tips (G4's notification card). */
export async function weatherTipCard(ctx: Ctx, candidate: Doc<'candidates'>): Promise<ThreadCard | null> {
  const source = candidate.source;
  if (source?.kind !== 'weatherEvent' || (source.tip !== 'uv' && source.tip !== 'air')) return null;
  const event = await ctx.db.get(source.eventId);
  const place = event?.placeId ? await ctx.db.get(event.placeId) : null;
  const family = await ctx.db.get(candidate.familyId);
  if (!event || !place || !family) return null;
  const forecast = await cacheRow(ctx, place.familyId, place._id, 'forecast');
  const data = forecast && !forecast.failure ? (forecast.data as ForecastData) : null;
  const point = airAt(data?.air, event.start);
  const peak = airView(data?.air, event.start, family.timezone).air?.uvIndexMax;
  return {
    kind: 'weather',
    summary: candidate.draft.text,
    at: event.start,
    placeLabel: place.label,
    eventId: event._id,
    tip: source.tip,
    air: { ...(point?.usAqi !== undefined ? { usAqi: point.usAqi } : {}), ...(peak !== undefined ? { uvIndexMax: peak } : {}), ...(point?.uv !== undefined ? { uvAt: point.uv } : {}) },
  };
}

/** Delivery-time re-check for an alert candidate: still in the place's latest alerts and not ended. */
export async function alertStillActive(ctx: Ctx, familyId: Id<'families'>, placeId: Id<'places'>, alertId: string, now: number): Promise<boolean> {
  const row = await cacheRow(ctx, familyId, placeId, 'alerts');
  if (!row || row.failure) return true; // can't tell (a failed poll): keep it rather than silently dropping a warning
  return activeAlerts(row.data as AlertsData, now).some((a) => a.id === alertId);
}

/** The loudness an alert push uses (WEATHER.alertLoudness), falling back to the `update` kind's own. */
export async function alertLoudness(ctx: Ctx, familyId: Id<'families'>, placeId: Id<'places'>, alertId: string) {
  const row = await cacheRow(ctx, familyId, placeId, 'alerts');
  const a = ((row?.data as AlertsData | null)?.alerts ?? []).find((x) => x.id === alertId);
  const map = WEATHER.alertLoudness as Partial<Record<AlertSeverity, (typeof NOTIFICATION_KINDS_CONFIG)['update']['loudness']>>;
  return (a && map[a.severity]) ?? NOTIFICATION_KINDS_CONFIG.update.loudness;
}
