import { maybeSuggestEventShare } from './layers';
import { memberAgeGroup } from './memberAge';
import { clock as permissionClock } from '../ports/clock';
// G5 (CONTRACT v0.17): connected accounts — the shared logic behind `integrations.*`, `mail.*`, the OAuth
// callback and the sync actions. Rules (docs/gates/G5.md invariants 2, 3, 8): an integration belongs to one
// member and only that member ever sees it; everything it brings in is that member's PRIVATE layer
// (`scope: 'personal'`, `ownerId`, `who` = the owner) until they share it; disconnecting removes the private
// copies it made and leaves anything already shared alone.
import type { CONNECT_OFFERS, INTEGRATION_KINDS } from '../../shared/config/ids';
import type { IntegrationFailure } from '../ports/integrationResult';
import { GOOGLE } from '../../shared/config/google';
import type { IntegrationView, OfferView } from '../../shared/domain/api';
import type { ExternalEvent } from '../../shared/domain/integrationShapes';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { addDays, localDate, zonedInstant } from '../../shared/time';
import { fail } from './errors';
import { postCard } from './proactive';
import { googleAvailable } from './tokenVault';

type Ctx = QueryCtx | MutationCtx;
export type ConnectOffer = (typeof CONNECT_OFFERS)[number];
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];
type Integration = Doc<'integrations'>;

/** Which integration kinds stand behind each connect offer (one `calendar` card offers both calendars). */
export const OFFER_KINDS: Record<ConnectOffer, readonly IntegrationKind[]> = {
  gmail: ['gmail'],
  calendar: ['googleCalendar', 'deviceCalendar'],
  ics: ['ics'],
};

/** The offer a kind answers (for onboarding's "connected → next step"). */
export function offerOf(kind: IntegrationKind): ConnectOffer | null {
  if (kind === 'gmail') return 'gmail';
  if (kind === 'googleCalendar' || kind === 'deviceCalendar') return 'calendar';
  if (kind === 'ics') return 'ics';
  return null;
}

/** `events.source` for events an integration kind brings in. */
export const EVENT_SOURCE = { googleCalendar: 'google', ics: 'ics', deviceCalendar: 'device', gmail: 'gmail' } as const;
export type SyncedKind = keyof typeof EVENT_SOURCE;

export const GOOGLE_KINDS = ['gmail', 'googleCalendar'] as const;
export const isGoogleKind = (k: IntegrationKind): k is (typeof GOOGLE_KINDS)[number] => (GOOGLE_KINDS as readonly string[]).includes(k);

export function statusOf(row: Integration): NonNullable<Integration['status']> {
  return row.status ?? 'connected';
}

/** A member's integrations of every kind, disconnected rows included (they're reused on reconnect). */
export async function memberIntegrations(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Integration[]> {
  return ctx.db
    .query('integrations')
    .withIndex('by_family_member_kind', (q) => q.eq('familyId', familyId).eq('memberId', memberId))
    .collect();
}

/** The caller's own integration, or NOT_FOUND for anyone else's (the admin included) or another family's. */
export async function requireOwnIntegration(ctx: Ctx, member: Doc<'members'>, integrationId: Id<'integrations'>): Promise<Integration> {
  const row = await ctx.db.get(integrationId);
  if (!row || row.familyId !== member.familyId || row.memberId !== member._id) fail('NOT_FOUND');
  return row;
}

/** Kids don't connect accounts (their MEGA's sources are the household's); FORBIDDEN, like other adult tools. */
export async function requireConnector(ctx: Ctx, member: Doc<'members'>): Promise<void> {
  if (!await connectorAllowed(ctx, member)) fail('FORBIDDEN', 'Children cannot connect accounts. Teens need parent approval.');
}

/** Events (and, for Gmail, found items) this integration brought in during the family's current month. */
async function countThisMonth(ctx: Ctx, row: Integration, now: number, tz: string): Promise<number> {
  const today = localDate(now, tz);
  const monthStart = zonedInstant(`${today.slice(0, 8)}01`, 0, tz);
  const [y, m] = today.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const monthEnd = zonedInstant(next, 0, tz);
  if (row.kind === 'gmail') {
    const items = await ctx.db
      .query('mailItems')
      .withIndex('by_family_member_found', (q) => q.eq('familyId', row.familyId).eq('memberId', row.memberId!).gte('foundAt', monthStart).lt('foundAt', monthEnd))
      .collect();
    return items.filter((i) => i.integrationId === row._id && i.status === 'added').length;
  }
  const events = await ctx.db
    .query('events')
    .withIndex('by_integration_external', (q) => q.eq('integrationId', row._id))
    .collect();
  return events.filter((e) => !e.cancelled && e.start >= monthStart && e.start < monthEnd).length;
}

/** What Settings and the connect cards show: never the ICS URL, a token or the raw `config`. */
export async function integrationView(ctx: Ctx, row: Integration, now: number, tz: string): Promise<IntegrationView> {
  return {
    integrationId: row._id,
    kind: row.kind,
    status: statusOf(row),
    label: row.label,
    host: row.host,
    connectedAt: row.connectedAt,
    lastSyncAt: row.lastSyncAt,
    lastFailure: row.lastFailure,
    countThisMonth: await countThisMonth(ctx, row, now, tz),
  };
}

export async function onboardingRow(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Doc<'onboarding'> | null> {
  return ctx.db
    .query('onboarding')
    .withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', memberId))
    .unique();
}

/** `integrations.offer`: the live state behind a `connect` card. */
export async function buildOfferView(ctx: Ctx, member: Doc<'members'>, offer: ConnectOffer, now: number, tz: string): Promise<OfferView> {
  const kinds = OFFER_KINDS[offer];
  const live = (await memberIntegrations(ctx, member.familyId, member._id)).filter((r) => (kinds as readonly string[]).includes(r.kind) && statusOf(r) !== 'disconnected');
  const integrations = await Promise.all(live.map((r) => integrationView(ctx, r, now, tz)));
  const row = await onboardingRow(ctx, member.familyId, member._id);
  const failure = row?.failures?.[offer];
  const state: OfferView['state'] = integrations.some((i) => i.status === 'connected') ? 'connected' : failure || integrations.some(i => i.status === 'error' || i.status === 'needs_reconnect') ? 'failed' : row?.outcomes[offer] === 'skipped' ? 'skipped' : 'offered';
  return { offer, state, integrations, available: { google: googleAvailable() }, ...(state === 'failed' && failure ? { failure } : {}) };
}

/** Records (or clears) a failed connect attempt for an offer, so the card shows "didn't work, try again". */
export async function setOfferFailure(ctx: MutationCtx, familyId: Id<'families'>, memberId: Id<'members'>, offer: ConnectOffer, failure: IntegrationFailure | undefined, now: number): Promise<void> {
  const row = await onboardingRow(ctx, familyId, memberId);
  if (row) {
    await ctx.db.patch(row._id, { failures: { ...(row.failures ?? {}), [offer]: failure } });
    return;
  }
  if (!failure) return;
  // A member who joined (no onboarding chat) connecting from Settings: a finished row holds the offer state.
  await ctx.db.insert('onboarding', { familyId, memberId, step: 'done', outcomes: {}, startedAt: now, finishedAt: now, failures: { [offer]: failure } });
}

/** Creates or revives (a disconnected row of the same kind) one integration for a member. */
export async function upsertIntegration(
  ctx: MutationCtx,
  p: { familyId: Id<'families'>; memberId: Id<'members'>; kind: IntegrationKind; config: Record<string, unknown>; label?: string; host?: string; now: number; match?: (row: Integration) => boolean },
): Promise<Id<'integrations'>> {
  const existing = (await memberIntegrations(ctx, p.familyId, p.memberId)).find((r) => r.kind === p.kind && (p.match ? p.match(r) : true));
  const fields = { config: p.config, status: 'connected' as const, label: p.label, host: p.host, connectedAt: p.now, disconnectedAt: undefined, lastFailure: undefined, lastFailureAt: undefined };
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return ctx.db.insert('integrations', { familyId: p.familyId, memberId: p.memberId, kind: p.kind, ...fields });
}

/** After a Google consent: connects the products the member wanted AND Google granted (the consent screen lets
 * people untick a box). Returns the connected integrations by product. */
export async function connectGoogleProducts(
  ctx: MutationCtx,
  p: { familyId: Id<'families'>; memberId: Id<'members'>; want: readonly ('gmail' | 'googleCalendar')[]; grantedScopes: readonly string[]; email?: string; now: number },
): Promise<{ product: 'gmail' | 'googleCalendar'; integrationId: Id<'integrations'> }[]> {
  const out: { product: 'gmail' | 'googleCalendar'; integrationId: Id<'integrations'> }[] = [];
  for (const product of p.want) {
    if (!p.grantedScopes.includes(GOOGLE.scopes[product])) {
      const denied = (await memberIntegrations(ctx, p.familyId, p.memberId)).find(r => r.kind === product);
      if (denied) await ctx.db.patch(denied._id, { status: 'error', lastFailure: 'unauthorized', lastFailureAt: p.now });
      continue;
    }
    const existing = (await memberIntegrations(ctx, p.familyId, p.memberId)).find((r) => r.kind === product);
    // Keep the sync position across a reconnect only for the same account.
    const sameAccount = existing && existing.label === p.email;
    if (existing && !sameAccount) await removeIntegrationData(ctx, existing);
    const config = product === 'gmail' ? (sameAccount ? existing.config : {}) : { calendarId: 'primary', ...(sameAccount ? { syncToken: (existing.config as { syncToken?: string }).syncToken } : {}) };
    const integrationId = await upsertIntegration(ctx, { familyId: p.familyId, memberId: p.memberId, kind: product, config, label: p.email, now: p.now });
    out.push({ product, integrationId });
  }
  return out;
}

/** Window helpers in the family's timezone (local midnight boundaries). */
export function windowAround(now: number, tz: string, pastDays: number, futureDays: number): { windowStart: number; windowEnd: number } {
  const today = localDate(now, tz);
  return { windowStart: zonedInstant(addDays(today, -pastDays), 0, tz), windowEnd: zonedInstant(addDays(today, futureDays + 1), 0, tz) };
}

/** Upserts outside events as the owner's private events, keyed by (integration, externalId). Cancelled ones are
 * removed. With `full`, anything this integration made inside the window that isn't in `events` is removed too
 * (a full Google sync, a schedule link refetch, a phone sync). Events already shared (no longer `personal`)
 * are never touched: they're household data now. */
export async function applyExternalEvents(
  ctx: MutationCtx,
  integration: Integration,
  events: ExternalEvent[],
  opts: { full?: { windowStart: number; windowEnd: number } },
): Promise<{ added: number; updated: number; removed: number }> {
  const ownerId = integration.memberId;
  if (!ownerId) return { added: 0, updated: 0, removed: 0 };
  const source = EVENT_SOURCE[integration.kind as SyncedKind];
  const existing = await ctx.db
    .query('events')
    .withIndex('by_integration_external', (q) => q.eq('integrationId', integration._id))
    .collect();
  const mailPlans = integration.kind === 'googleCalendar' ? await ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', integration.familyId).eq('ownerId', ownerId)).collect() : [];
  const byExternal = new Map(existing.map((e) => [e.externalId ?? '', e]));
  let added = 0;
  let updated = 0;
  let removed = 0;
  const seen = new Set<string>();
  for (const e of events) {
    seen.add(e.externalId);
    const mine = byExternal.get(e.externalId);
    if (e.cancelled) {
      if (mine && mine.scope === 'personal') {
        await ctx.db.delete(mine._id);
        removed++;
      }
      continue;
    }
    const fields = { title: e.title.slice(0, 200), start: e.start, end: e.end, allDay: e.allDay, place: e.location?.slice(0, 200) };
    if (mine) {
      if (mine.scope !== 'personal') continue;
      if (mine.title !== fields.title || mine.start !== fields.start || mine.end !== fields.end || mine.allDay !== fields.allDay || mine.place !== fields.place) {
        await ctx.db.patch(mine._id, fields);
        updated++;
      }
      continue;
    }
    const importedId = await ctx.db.insert('events', {
      familyId: integration.familyId,
      ...fields,
      who: [ownerId],
      source,
      externalId: e.externalId,
      integrationId: integration._id,
      createdBy: ownerId,
      ownerId,
      scope: 'personal',
      cancelled: false,
    });
    // Gmail may recognize a commitment before Calendar imports the same event.
    if (integration.kind === 'googleCalendar') {
      for (const plan of mailPlans) {
        if (!plan.ownsEvent || !plan.eventId || plan.calendarExternalId || plan.status !== 'confirmed' || plan.selected?.start !== e.start || plan.selected?.end !== e.end) continue;
        const mailEvent = await ctx.db.get(plan.eventId);
        if (mailEvent?.source !== 'gmail' || mailEvent.scope !== 'personal' || mailEvent.ownerId !== ownerId || mailEvent.start !== e.start || mailEvent.end !== e.end || mailEvent.title.trim().toLowerCase() !== fields.title.trim().toLowerCase()) continue;
        await ctx.db.patch(plan._id, { eventId: importedId, ownsEvent: false });
        await ctx.db.delete(mailEvent._id);
      }
    }
    if (integration.lastSyncAt !== undefined) {
      const event = await ctx.db.get(importedId);
      const family = await ctx.db.get(integration.familyId);
      if (event && family) await maybeSuggestEventShare(ctx, event, family.timezone, await permissionClock.now(ctx, integration.familyId));
    }
    added++;
  }
  if (opts.full) {
    for (const mine of existing) {
      if (seen.has(mine.externalId ?? '') || mine.scope !== 'personal') continue;
      if (mine.start < opts.full.windowStart || mine.start >= opts.full.windowEnd) continue;
      await ctx.db.delete(mine._id);
      removed++;
    }
  }
  return { added, updated, removed };
}

/** Disconnect's cleanup: the private events, reminders and found items this integration made. Shared copies
 * (an event the owner moved to the household layer) stay. */
export async function removeIntegrationData(ctx: MutationCtx, integration: Integration): Promise<void> {
  const events = await ctx.db
    .query('events')
    .withIndex('by_integration_external', (q) => q.eq('integrationId', integration._id))
    .collect();
  for (const e of events) if (e.scope === 'personal') await ctx.db.delete(e._id);
  if (integration.kind !== 'gmail' || !integration.memberId) return;
  await ctx.db.patch(integration._id, { watchExpiresAt: undefined, watchFailure: undefined, lastMailPushAt: undefined, mailWakeQueued: false, mailWakeUntil: undefined });
  const plans = await ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', integration.familyId).eq('ownerId', integration.memberId!)).collect();
  for (const plan of plans) if (plan.integrationId === integration._id) await ctx.db.delete(plan._id);
  const items = await ctx.db
    .query('mailItems')
    .withIndex('by_family_member_found', (q) => q.eq('familyId', integration.familyId).eq('memberId', integration.memberId!))
    .collect();
  for (const item of items.filter((i) => i.integrationId === integration._id)) {
    if (item.reminderId) {
      const r = await ctx.db.get(item.reminderId);
      if (r && r.forMemberId === integration.memberId) await ctx.db.delete(r._id);
    }
    await ctx.db.delete(item._id);
  }
}

/** A Google grant lapsed (Testing mode: 7 days) or was revoked: every Google integration of the member flips
 * to `needs_reconnect` (polling stops) and one `reconnect` card goes to their thread per integration that was
 * connected until now (never a second card for the same lapse). */
/** One Google grant lapsed: every Google integration on it needs a reconnect. v0.17b (C10): ONE card per lapse,
 * listing them all (`integrationIds`; `integrationId` is the first, for older apps). */
export async function markNeedsReconnect(ctx: MutationCtx, familyId: Id<'families'>, memberId: Id<'members'>, now: number): Promise<void> {
  const lapsed: Id<'integrations'>[] = [];
  for (const row of await memberIntegrations(ctx, familyId, memberId)) {
    if (!isGoogleKind(row.kind) || statusOf(row) !== 'connected') continue;
    await ctx.db.patch(row._id, { status: 'needs_reconnect', lastFailure: 'unauthorized', lastFailureAt: now });
    lapsed.push(row._id);
  }
  if (lapsed.length) await postCard(ctx, { familyId, recipientId: memberId, card: { kind: 'reconnect', integrationId: lapsed[0], integrationIds: lapsed }, now });
}

/** v0.17b (C4): a sync's config write MERGES into what's stored (a concurrent writer's keys survive); a key set to
 * `null` is removed (e.g. an expired Calendar sync token). */
export function mergeConfig(stored: unknown, update: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...((stored ?? {}) as Record<string, unknown>) };
  for (const [k, val] of Object.entries(update)) {
    if (val === null || val === undefined) delete out[k];
    else out[k] = val;
  }
  return out;
}

/** A sync attempt's outcome on the row: last sync time, or the failure (kept `connected` for transient errors).
 * Releases the sync lease (C4). */
export async function recordSync(ctx: MutationCtx, integrationId: Id<'integrations'>, p: { now: number; failure?: IntegrationFailure; config?: Record<string, unknown> }): Promise<void> {
  const row = await ctx.db.get(integrationId);
  if (!row) return;
  const config = p.config ? { config: mergeConfig(row.config, p.config) } : {};
  if (p.failure) await ctx.db.patch(row._id, { lastFailure: p.failure, lastFailureAt: p.now, syncingUntil: undefined, ...config });
  else await ctx.db.patch(row._id, { lastSyncAt: p.now, lastFailure: undefined, lastFailureAt: undefined, syncingUntil: undefined, ...config });
}

export async function connectorAllowed(ctx: Ctx, member: Doc<'members'>) {
  const group = await memberAgeGroup(ctx, member);
  return group === 'adult' || (group === 'teen' && !!member.connectionsApprovedBy);
}
