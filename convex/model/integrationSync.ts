// G5: the sync loops for each integration kind, run inside actions (they call outside APIs). Each one loads the
// integration, does the provider calls through its port, and hands the result to ONE internal mutation that
// writes it (private events, found items, the sync position). Used by the cron polls and `integrations.syncNow`.
// Invariant 9: incremental and self-healing — Gmail's stale history id (404) and Calendar's expired sync token
// (410) fall back to a full sync; nothing is duplicated (events keyed by integration × externalId, found items
// by message × index); a schedule link's 304 costs nothing.
import { GMAIL, GOOGLE_CALENDAR } from '../../shared/config/google';
import { ICS } from '../../shared/config/onboarding';
import type { INTEGRATION_STATUSES } from '../../shared/config/ids';
import type { DecidedBy } from '../../shared/domain/tables';
import type { ExternalEvent } from '../../shared/domain/integrationShapes';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { getCalendarSource, getIcsFetcher, getMailSource } from '../adapters/registry';
import type { IntegrationFailure } from '../ports/integrationResult';
import { accessTokenFor } from './googleAccess';
import { parseIcs } from './ics';
import { windowAround } from './integrations';
import { extractItems, isSkippedSender, type ExtractedItem } from './mailExtract';

type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export type SyncOutcome = { status: IntegrationStatus; failure?: IntegrationFailure };

type GmailConfig = { historyId?: string; seen?: string[]; pending?: string[]; firstLookDone?: boolean };

async function failed(ctx: ActionCtx, integrationId: Id<'integrations'>, failure: IntegrationFailure, firstLook = false): Promise<SyncOutcome> {
  // `unauthorized` already flipped the integration to needs_reconnect (googleAccess / markLapsed).
  await ctx.runMutation(internal.integrations.recordSyncFailure, { integrationId, failure, firstLook });
  return { status: failure === 'unauthorized' ? 'needs_reconnect' : 'connected', failure };
}

export async function syncGmail(ctx: ActionCtx, integrationId: Id<'integrations'>, firstLook = false): Promise<SyncOutcome> {
  const load = await ctx.runQuery(internal.integrations.loadForSync, { integrationId });
  if (!load || load.integration.kind !== 'gmail' || !load.integration.memberId) return { status: 'disconnected' };
  if (load.status !== 'connected') return { status: load.status };
  const { integration, timezone, now } = load;
  const token = await accessTokenFor(ctx, integration.familyId, integration.memberId!);
  if (!token.ok) return failed(ctx, integrationId, token.failure, firstLook);
  const source = getMailSource();
  const cfg = (integration.config ?? {}) as GmailConfig;

  let historyId = cfg.historyId;
  let newIds: string[] = [];
  let full = !historyId;
  if (historyId) {
    const h = await source.history({ accessToken: token.accessToken, startHistoryId: historyId, max: GMAIL.historyMaxResults });
    if (!h.ok) {
      if (h.failure === 'unauthorized') await ctx.runMutation(internal.integrations.markLapsed, { familyId: integration.familyId, memberId: integration.memberId! });
      return failed(ctx, integrationId, h.failure, firstLook);
    }
    if (h.stale) full = true;
    else {
      newIds = h.messageIds;
      historyId = h.historyId;
    }
  }
  if (full) {
    const profile = await source.profile({ accessToken: token.accessToken });
    if (!profile.ok) {
      if (profile.failure === 'unauthorized') await ctx.runMutation(internal.integrations.markLapsed, { familyId: integration.familyId, memberId: integration.memberId! });
      return failed(ctx, integrationId, profile.failure, firstLook);
    }
    const list = await source.listRecent({ accessToken: token.accessToken, newerThanDays: GMAIL.firstSyncDays, max: GMAIL.maxMessagesPerPoll + GMAIL.pendingMax });
    if (!list.ok) return failed(ctx, integrationId, list.failure, firstLook);
    historyId = profile.historyId;
    newIds = list.messageIds;
  }

  const seen = new Set(cfg.seen ?? []);
  const queue = [...new Set([...(cfg.pending ?? []), ...newIds])].filter((id) => !seen.has(id));
  const batch = queue.slice(0, GMAIL.maxMessagesPerPoll);
  let rest = queue.slice(GMAIL.maxMessagesPerPoll, GMAIL.maxMessagesPerPoll + GMAIL.pendingMax);

  const found: { gmailMessageId: string; sourceLabel: string; items: ExtractedItem[] }[] = [];
  const processed: string[] = [];
  let decidedBy: DecidedBy = 'rule:skipSender';
  for (const [i, id] of batch.entries()) {
    const got = await source.getMessage({ accessToken: token.accessToken, id, maxBodyChars: GMAIL.maxBodyChars });
    if (!got.ok) {
      if (got.failure === 'no_result') {
        processed.push(id); // deleted since: nothing to read
        continue;
      }
      rest = [...batch.slice(i), ...rest].slice(0, GMAIL.pendingMax);
      break;
    }
    if (isSkippedSender(got.message.fromAddress)) {
      processed.push(id);
      continue;
    }
    try {
      const r = await extractItems(ctx, integration.familyId, got.message, timezone, now);
      decidedBy = r.decidedBy;
      if (r.items.length) found.push({ gmailMessageId: id, sourceLabel: got.message.fromName.slice(0, 80) || 'Gmail', items: r.items });
      processed.push(id);
    } catch {
      // Model down or over budget: keep the rest for the next poll.
      rest = [...batch.slice(i), ...rest].slice(0, GMAIL.pendingMax);
      break;
    }
  }

  const config: GmailConfig = { historyId, seen: [...(cfg.seen ?? []), ...processed].slice(-GMAIL.seenMemory), pending: rest, firstLookDone: true };
  await ctx.runMutation(internal.integrations.recordMail, { integrationId, found, decidedBy, config, firstLook: firstLook || !cfg.firstLookDone });
  return { status: 'connected' };
}

export async function syncGoogleCalendar(ctx: ActionCtx, integrationId: Id<'integrations'>): Promise<SyncOutcome> {
  const load = await ctx.runQuery(internal.integrations.loadForSync, { integrationId });
  if (!load || load.integration.kind !== 'googleCalendar' || !load.integration.memberId) return { status: 'disconnected' };
  if (load.status !== 'connected') return { status: load.status };
  const { integration, timezone, now } = load;
  const token = await accessTokenFor(ctx, integration.familyId, integration.memberId!);
  if (!token.ok) return failed(ctx, integrationId, token.failure);
  const source = getCalendarSource();
  const cfg = (integration.config ?? {}) as { calendarId?: string; syncToken?: string };
  const calendarId = cfg.calendarId ?? GOOGLE_CALENDAR.calendarId;
  const window = windowAround(now, timezone, GOOGLE_CALENDAR.pastDays, GOOGLE_CALENDAR.futureDays);

  const collect = async (syncToken?: string): Promise<{ events: ExternalEvent[]; nextSyncToken?: string } | { expired: true } | { failure: IntegrationFailure }> => {
    const events: ExternalEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await source.listEvents({ accessToken: token.accessToken, calendarId, timeZone: timezone, ...(syncToken ? { syncToken } : { timeMin: window.windowStart, timeMax: window.windowEnd }), pageToken });
      if (!r.ok) return { failure: r.failure };
      if (r.expired) return { expired: true };
      events.push(...r.events);
      nextSyncToken = r.nextSyncToken ?? nextSyncToken;
      pageToken = r.nextPageToken;
      if (!pageToken || events.length >= GOOGLE_CALENDAR.maxEvents) break;
    }
    return { events: events.slice(0, GOOGLE_CALENDAR.maxEvents), nextSyncToken };
  };

  let result = cfg.syncToken ? await collect(cfg.syncToken) : null;
  let full = !cfg.syncToken;
  if (result && 'expired' in result) {
    full = true;
    result = null;
  }
  if (!result) result = await collect();
  if ('failure' in result) {
    if (result.failure === 'unauthorized') await ctx.runMutation(internal.integrations.markLapsed, { familyId: integration.familyId, memberId: integration.memberId! });
    return failed(ctx, integrationId, result.failure);
  }
  if ('expired' in result) return failed(ctx, integrationId, 'error');
  // Incremental changes can include events far outside our window: keep only what's in it (cancellations pass).
  const events = full ? result.events : result.events.filter((e) => e.cancelled || (e.start < window.windowEnd && (e.end ?? e.start) >= window.windowStart));
  await ctx.runMutation(internal.integrations.applyEvents, {
    integrationId,
    events,
    ...(full ? { full: window } : {}),
    config: { calendarId, ...(result.nextSyncToken ? { syncToken: result.nextSyncToken } : {}) },
  });
  return { status: 'connected' };
}

/** Fetches and parses a schedule link into the window. `ok: false` = it couldn't be read (nothing written). */
export async function readIcs(url: string, prev: { etag?: string; lastModified?: string }, timezone: string, now: number) {
  const r = await getIcsFetcher().fetch({ url, etag: prev.etag, lastModified: prev.lastModified, maxBytes: ICS.maxBytes, timeoutMs: ICS.timeoutMs });
  if (!r.ok) return r;
  if (r.notModified) return { ok: true as const, notModified: true as const };
  if (!/BEGIN:VCALENDAR/i.test(r.text)) return { ok: false as const, failure: 'error' as const, detail: 'not a calendar' };
  const window = windowAround(now, timezone, ICS.pastDays, ICS.futureDays);
  const parsed = parseIcs(r.text, { familyTz: timezone, ...window });
  return { ok: true as const, notModified: false as const, label: parsed.label, events: parsed.events, window, etag: r.etag, lastModified: r.lastModified };
}

export async function syncIcs(ctx: ActionCtx, integrationId: Id<'integrations'>): Promise<SyncOutcome> {
  const load = await ctx.runQuery(internal.integrations.loadForSync, { integrationId });
  if (!load || load.integration.kind !== 'ics') return { status: 'disconnected' };
  if (load.status !== 'connected') return { status: load.status };
  const cfg = (load.integration.config ?? {}) as { url?: string; etag?: string; lastModified?: string };
  if (!cfg.url) return failed(ctx, integrationId, 'error');
  const r = await readIcs(cfg.url, cfg, load.timezone, load.now);
  if (!r.ok) return failed(ctx, integrationId, r.failure);
  if (r.notModified) {
    await ctx.runMutation(internal.integrations.applyEvents, { integrationId, events: [], config: cfg });
    return { status: 'connected' };
  }
  await ctx.runMutation(internal.integrations.applyEvents, { integrationId, events: r.events, full: r.window, config: { url: cfg.url, etag: r.etag, lastModified: r.lastModified } });
  return { status: 'connected' };
}
