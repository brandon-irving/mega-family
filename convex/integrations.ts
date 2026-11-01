import { DEMO_CLEANUP } from '../shared/config/demo';
import { demoGate } from './model/demoConsole';
import { connectorAllowed } from './model/integrations';
import { SCHEDULING } from '../shared/config/scheduling';
// CONTRACT §4 `integrations.*` (G5, v0.17): connected accounts — Gmail and Google Calendar (one Google grant per
// member, read-only), this phone's calendar (synced up by the app), schedule links (.ics). Owner-only everywhere:
// another member's integrations are NOT_FOUND, the admin's included (docs/gates/G5.md invariant 2). Tokens live
// only in `integrationSecrets` as ciphertext and never leave the server (invariant 1). Everything found lands in
// the owner's private layer (invariant 3). The OAuth callback is an HTTP route (convex/http.ts).
import { v } from 'convex/values';
import { G5_COPY, fillCopy } from '../shared/config/copy';
import { DEVICE_CALENDAR, ICS, ICS_FAILURE_REASONS, ONBOARDING } from '../shared/config/onboarding';
import { GMAIL, GOOGLE, INTEGRATION_SYNC } from '../shared/config/google';
import { API } from '../shared/domain/api';
import { externalEvent } from '../shared/domain/integrationShapes';
import * as T from '../shared/domain/tables';
import { addDays, localDateTimeToInstant, zonedInstant } from '../shared/time';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server';
import { getGoogleOAuth } from './adapters/registry';
import { icsFetchUrl } from './adapters/icsHttp';
import { pick } from './model/define';
import { fail } from './model/errors';
import {
  applyExternalEvents,
  buildOfferView,
  connectGoogleProducts,
  GOOGLE_KINDS,
  integrationView,
  isGoogleKind,
  markNeedsReconnect,
  memberIntegrations,
  recordSync,
  removeIntegrationData,
  requireConnector,
  requireOwnIntegration,
  setOfferFailure,
  statusOf,
  upsertIntegration,
} from './model/integrations';
import { readIcs, syncGmail as syncGmailCore, syncGoogleCalendar as syncGoogleCalendarCore, syncIcs as syncIcsCore, type SyncOutcome } from './model/integrationSync';
import { eventPreview, suggestShare } from './model/layers';

type IcsFailureReason = (typeof ICS_FAILURE_REASONS)[number];
import { completeOffer, gmailFirstLookDone } from './model/onboarding';
import { postCard } from './model/proactive';
import { randomToken } from './model/random';
import { postOwnMegaMessage } from './model/threads';
import { decryptToken, encryptToken, googleAvailable } from './model/tokenVault';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

const googleProducts = v.array(T.googleProduct);
const windowArg = v.object({ windowStart: v.number(), windowEnd: v.number() });
const statusResult = v.object({ status: T.integrationStatus, failure: v.optional(T.integrationFailure) });

/** Where Google sends the browser back: our Convex site URL + GOOGLE.callbackPath (registered in Google Cloud). */
export function googleRedirectUri(): string | null {
  const site = process.env.CONVEX_SITE_URL;
  return site ? `${site.replace(/\/$/, '')}${GOOGLE.callbackPath}` : null;
}

/** v0.17b (C9): every offer a Google consent covered (Gmail and/or Calendar), so a failure lands on each. */
function offersForProducts(want: readonly string[]): ('gmail' | 'calendar')[] {
  return [...(want.includes('gmail') ? (['gmail'] as const) : []), ...(want.includes('googleCalendar') ? (['calendar'] as const) : [])];
}

async function sayAsOwnMega(ctx: MutationCtx, familyId: Id<'families'>, memberId: Id<'members'>, text: string, now: number): Promise<void> {
  await postOwnMegaMessage(ctx, familyId, memberId, { type: 'text', text }, now);
}

// ---------- public ----------

export const list = query({
  ...pick(API.integrations.list),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const now = await clock.now(ctx, viewer.member.familyId);
    const rows = (await memberIntegrations(ctx, viewer.member.familyId, viewer.member._id)).filter((r) => statusOf(r) !== 'disconnected');
    return Promise.all(rows.map((r) => integrationView(ctx, r, now, viewer.family.timezone)));
  },
});

export const offer = query({
  ...pick(API.integrations.offer),
  handler: async (ctx, { offer }) => {
    const viewer = await requireViewer(ctx);
    return buildOfferView(ctx, viewer.member, offer, await clock.now(ctx, viewer.member.familyId), viewer.family.timezone);
  },
});

export const googleStart = mutation({
  ...pick(API.integrations.googleStart),
  handler: async (ctx, { want, loginHint, scheduling, demoCleanup }) => {
    const viewer = await requireViewer(ctx);
    requireConnector(viewer.member);
    if (demoCleanup) demoGate();
    const products = [...new Set(want)];
    if (!products.length) fail('VALIDATION', 'nothing to connect');
    const redirectUri = googleRedirectUri();
    if (!googleAvailable() || !redirectUri) fail('VALIDATION', 'not_configured');
    const { token: nonce, hash } = await randomToken();
    const now = clock.realNow(); // Google's consent screen runs in real time, whatever the demo clock says
    await ctx.db.insert('oauthStates', { familyId: viewer.member.familyId, memberId: viewer.member._id, nonceHash: hash, want: products, createdAt: now, expiresAt: now + GOOGLE.stateTtlMinutes * 60_000 });
    const scopes = [...GOOGLE.identityScopes, ...products.map((p) => GOOGLE.scopes[p]), ...(scheduling ? Object.values(SCHEDULING.scopes) : []), ...(demoCleanup ? [DEMO_CLEANUP.gmailScope] : [])];
    return { authUrl: getGoogleOAuth().authUrl({ scopes, state: nonce, redirectUri, loginHint: loginHint?.slice(0, 200) }) };
  },
});

/** Actions can't read the db: they check the caller through this query (the identity carries over). */
export const callerCheck = internalQuery({
  args: { connector: v.optional(v.boolean()) },
  returns: v.object({ familyId: v.id('families'), memberId: v.id('members'), timezone: v.string(), now: v.number() }),
  handler: async (ctx, { connector }) => {
    const viewer = await requireViewer(ctx);
    if (connector) requireConnector(viewer.member);
    return { familyId: viewer.member.familyId, memberId: viewer.member._id, timezone: viewer.family.timezone, now: await clock.now(ctx, viewer.member.familyId) };
  },
});

/** Kept for the contract step's callers; same as `callerCheck({})`. */
export const requireMemberCheck = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return null;
  },
});

/** Exchanges a Google code and stores the grant for `familyId`/`memberId` (the web callback and iOS share it). */
export async function exchangeAndStore(
  ctx: { runMutation: import('./_generated/server').ActionCtx['runMutation'] },
  p: { familyId: Id<'families'>; memberId: Id<'members'>; want: ('gmail' | 'googleCalendar')[]; code: string; redirectUri: string; expectedEmail?: string },
): Promise<SyncOutcome> {
  const r = await getGoogleOAuth().exchangeCode({ code: p.code, redirectUri: p.redirectUri });
  if (!r.ok || !r.tokens.refreshToken) {
    const failure = r.ok ? 'error' : r.failure;
    await ctx.runMutation(internal.integrations.setFailures, { familyId: p.familyId, memberId: p.memberId, want: p.want, failure });
    return { status: 'error', failure };
  }
  if (p.expectedEmail && r.tokens.email?.toLowerCase() !== p.expectedEmail.toLowerCase()) fail('VALIDATION', `Choose ${p.expectedEmail} in Google. No connection was changed.`);
  const now = clock.realNow();
  const { connected } = await ctx.runMutation(internal.integrations.storeGrant, {
    familyId: p.familyId,
    memberId: p.memberId,
    want: p.want,
    refreshToken: await encryptToken(r.tokens.refreshToken),
    accessToken: await encryptToken(r.tokens.accessToken),
    accessTokenExpiresAt: now + r.tokens.expiresInSeconds * 1000,
    scopes: r.tokens.scopes,
    email: r.tokens.email,
  });
  return connected.length ? { status: 'connected' } : { status: 'error', failure: 'unauthorized' };
}

export const googleConnectCode = action({
  ...pick(API.integrations.googleConnectCode),
  handler: async (ctx, { serverAuthCode, want }): Promise<SyncOutcome> => {
    const caller = await ctx.runQuery(internal.integrations.callerCheck, { connector: true });
    const products = [...new Set(want)];
    if (!products.length) fail('VALIDATION', 'nothing to connect');
    if (!googleAvailable()) return { status: 'error', failure: 'not_configured' };
    // iOS: the native SDK's serverAuthCode is exchanged with the web client and an empty redirect_uri.
    return exchangeAndStore(ctx, { familyId: caller.familyId, memberId: caller.memberId, want: products, code: serverAuthCode, redirectUri: '' });
  },
});

export const connectDevice = mutation({
  ...pick(API.integrations.connectDevice),
  handler: async (ctx, { label, calendarIds }) => {
    const viewer = await requireViewer(ctx);
    requireConnector(viewer.member);
    const ids = [...new Set(calendarIds.map((c) => c.trim()).filter(Boolean))];
    if (!ids.length || ids.length > DEVICE_CALENDAR.maxCalendars) fail('VALIDATION', 'calendars');
    const now = await clock.now(ctx, viewer.member.familyId);
    const integrationId = await upsertIntegration(ctx, {
      familyId: viewer.member.familyId,
      memberId: viewer.member._id,
      kind: 'deviceCalendar',
      config: { calendarIds: ids },
      label: label.trim().slice(0, 60) || undefined,
      now,
    });
    await completeOffer(ctx, { familyId: viewer.member.familyId, memberId: viewer.member._id, offer: 'calendar', outcome: 'connected', now });
    return integrationId;
  },
});

export const syncDevice = mutation({
  ...pick(API.integrations.syncDevice),
  handler: async (ctx, { integrationId, windowStart, windowEnd, events }) => {
    const viewer = await requireViewer(ctx);
    const row = await requireOwnIntegration(ctx, viewer.member, integrationId);
    if (row.kind !== 'deviceCalendar' || statusOf(row) !== 'connected') fail('VALIDATION', 'not a connected phone calendar');
    if (events.length > DEVICE_CALENDAR.maxEventsPerSync) fail('VALIDATION', 'too many events');
    const maxSpan = (DEVICE_CALENDAR.pastDays + DEVICE_CALENDAR.futureDays + 2) * 86_400_000;
    if (!(windowEnd > windowStart) || windowEnd - windowStart > maxSpan) fail('VALIDATION', 'window');
    const allowed = new Set(((row.config ?? {}) as { calendarIds?: string[] }).calendarIds ?? []);
    const tz = viewer.family.timezone;
    const external = events
      .filter((e) => allowed.has(e.calendarId))
      .filter((e) => e.externalId.length <= 300 && Number.isFinite(e.start) && (e.end === undefined || e.end >= e.start))
      .filter((e) => e.allDay === undefined || /^\d{4}-\d{2}-\d{2}$/.test(e.allDay))
      .map((e) => ({
        externalId: e.externalId,
        title: e.title.trim().slice(0, 200) || 'Busy',
        start: e.allDay ? zonedInstant(e.allDay, 0, tz) : e.start,
        end: e.allDay ? (e.end ?? zonedInstant(addDays(e.allDay, 1), 0, tz)) : e.end,
        allDay: e.allDay,
        location: e.location?.slice(0, 200),
        cancelled: false,
      }))
      .filter((e) => e.start < windowEnd && (e.end ?? e.start) >= windowStart);
    const counts = await applyExternalEvents(ctx, row, external, { full: { windowStart, windowEnd } });
    await recordSync(ctx, row._id, { now: await clock.now(ctx, viewer.member.familyId) });
    return counts;
  },
});

export const addIcs = action({
  ...pick(API.integrations.addIcs),
  handler: async (ctx, { url }): Promise<{ integrationId?: Id<'integrations'>; label?: string; events: number; failure?: Doc<'integrations'>['lastFailure']; reason?: IcsFailureReason }> => {
    const caller = await ctx.runQuery(internal.integrations.callerCheck, { connector: true });
    const fetchUrl = icsFetchUrl(url);
    if (!fetchUrl || url.length > 2000) fail('VALIDATION', G5_COPY.icsBad);
    const r = await readIcs(url.trim(), {}, caller.timezone, caller.now);
    if (!r.ok || r.notModified) {
      const failure = r.ok ? 'error' : r.failure;
      // v0.17b (U1): say why, so "couldn't reach it" isn't shown as "that link didn't work".
      const reason: IcsFailureReason = !r.ok && (ICS_FAILURE_REASONS as readonly string[]).includes(r.detail ?? '') ? (r.detail as IcsFailureReason) : 'unreachable';
      await ctx.runMutation(internal.integrations.setFailure, { familyId: caller.familyId, memberId: caller.memberId, offer: 'ics', failure });
      return { events: 0, failure, reason };
    }
    const host = new URL(fetchUrl).host;
    const label = (r.label ?? host).slice(0, 80);
    const integrationId = await ctx.runMutation(internal.integrations.saveIcs, {
      url: url.trim(),
      label,
      host,
      etag: r.etag,
      lastModified: r.lastModified,
      events: r.events,
      window: r.window,
    });
    return { integrationId, label, events: r.events.length };
  },
});

export const prepareDisconnect = internalQuery({
  args: { integrationId: v.id('integrations') },
  returns: v.object({ done: v.boolean(), revokeCipher: v.optional(v.string()) }),
  handler: async (ctx, { integrationId }) => {
    const viewer = await requireViewer(ctx);
    const row = await requireOwnIntegration(ctx, viewer.member, integrationId);
    if (statusOf(row) === 'disconnected') return { done: true };
    if (!isGoogleKind(row.kind)) return { done: false };
    const others = (await memberIntegrations(ctx, row.familyId, viewer.member._id)).filter((r) => r._id !== row._id && isGoogleKind(r.kind) && statusOf(r) !== 'disconnected');
    if (others.length) return { done: false };
    const secret = await ctx.db
      .query('integrationSecrets')
      .withIndex('by_family_member_provider', (q) => q.eq('familyId', row.familyId).eq('memberId', viewer.member._id).eq('provider', 'google'))
      .unique();
    return { done: false, revokeCipher: secret?.refreshToken };
  },
});

export const finishDisconnect = internalMutation({
  args: { integrationId: v.id('integrations') },
  returns: v.null(),
  handler: async (ctx, { integrationId }) => {
    const viewer = await requireViewer(ctx);
    const row = await requireOwnIntegration(ctx, viewer.member, integrationId);
    if (statusOf(row) === 'disconnected') return null;
    await removeIntegrationData(ctx, row);
    const now = await clock.now(ctx, row.familyId);
    await ctx.db.patch(row._id, { status: 'disconnected', disconnectedAt: now, config: {}, lastFailure: undefined, lastFailureAt: undefined });
    if (isGoogleKind(row.kind)) {
      const live = (await memberIntegrations(ctx, row.familyId, viewer.member._id)).filter((r) => isGoogleKind(r.kind) && statusOf(r) !== 'disconnected');
      if (!live.length) {
        const secrets = await ctx.db
          .query('integrationSecrets')
          .withIndex('by_family_member_provider', (q) => q.eq('familyId', row.familyId).eq('memberId', viewer.member._id).eq('provider', 'google'))
          .collect();
        for (const s of secrets) await ctx.db.delete(s._id);
      }
    }
    const what = row.kind === 'gmail' ? 'Gmail' : row.kind === 'googleCalendar' ? 'Google Calendar' : row.kind === 'deviceCalendar' ? 'this phone’s calendar' : (row.label ?? 'that schedule link');
    await sayAsOwnMega(ctx, row.familyId, viewer.member._id, fillCopy(G5_COPY.accountDisconnected, { what }), now);
    return null;
  },
});

export const disconnect = action({
  ...pick(API.integrations.disconnect),
  handler: async (ctx, { integrationId }) => {
    const prep = await ctx.runQuery(internal.integrations.prepareDisconnect, { integrationId });
    if (prep.done) return null;
    if (prep.revokeCipher) {
      const token = await decryptToken(prep.revokeCipher);
      // Best effort: a grant that already lapsed has nothing to revoke; the secret is deleted either way.
      if (token) await getGoogleOAuth().revoke({ token });
    }
    await ctx.runMutation(internal.integrations.finishDisconnect, { integrationId });
    return null;
  },
});

export const prepareSyncNow = internalQuery({
  args: { integrationId: v.id('integrations') },
  returns: v.object({ kind: T.integrationKind, status: T.integrationStatus, lastFailure: v.optional(T.integrationFailure), tooSoon: v.boolean() }),
  handler: async (ctx, { integrationId }) => {
    const viewer = await requireViewer(ctx);
    const row = await requireOwnIntegration(ctx, viewer.member, integrationId);
    const now = await clock.now(ctx, row.familyId);
    const tooSoon = row.lastSyncAt !== undefined && now - row.lastSyncAt < INTEGRATION_SYNC.syncNowMinSeconds * 1000;
    return { kind: row.kind, status: statusOf(row), lastFailure: row.lastFailure, tooSoon };
  },
});

export const syncNow = action({
  ...pick(API.integrations.syncNow),
  handler: async (ctx, { integrationId }): Promise<SyncOutcome> => {
    const prep = await ctx.runQuery(internal.integrations.prepareSyncNow, { integrationId });
    if (prep.status !== 'connected' || prep.tooSoon) return { status: prep.status, ...(prep.lastFailure ? { failure: prep.lastFailure } : {}) };
    if (prep.kind === 'gmail') return syncGmailCore(ctx, integrationId);
    if (prep.kind === 'googleCalendar') return syncGoogleCalendarCore(ctx, integrationId);
    if (prep.kind === 'ics') return syncIcsCore(ctx, integrationId);
    return { status: prep.status }; // the phone's calendar syncs up from the app
  },
});

// ---------- internal: OAuth ----------

/** The callback's state check: unknown, expired or already used → null (and a used one stays used). */
export const consumeState = internalMutation({
  args: { nonceHash: v.string() },
  returns: v.union(v.null(), v.object({ familyId: v.id('families'), memberId: v.id('members'), want: googleProducts, expectedEmail: v.optional(v.string()) })),
  handler: async (ctx, { nonceHash }) => {
    const row = await ctx.db
      .query('oauthStates')
      .withIndex('by_nonceHash', (q) => q.eq('nonceHash', nonceHash))
      .unique();
    if (!row || row.usedAt !== undefined) return null;
    const now = clock.realNow();
    await ctx.db.patch(row._id, { usedAt: now });
    if (row.expiresAt < now) return null;
    const member = await ctx.db.get(row.memberId);
    if (!member || member.familyId !== row.familyId || !connectorAllowed(member)) return null;
    return { familyId: row.familyId, memberId: row.memberId, want: row.want, ...(row.expectedEmail ? { expectedEmail: row.expectedEmail } : {}) };
  },
});

export const setFailure = internalMutation({
  args: { familyId: v.id('families'), memberId: v.id('members'), offer: T.connectOffer, failure: T.integrationFailure },
  returns: v.null(),
  handler: async (ctx, p) => {
    await setOfferFailure(ctx, p.familyId, p.memberId, p.offer, p.failure, await clock.now(ctx, p.familyId));
    return null;
  },
});

/** v0.17b (C9): a Google connect attempt failed — record it on every offer the consent covered. */
export const setFailures = internalMutation({
  args: { familyId: v.id('families'), memberId: v.id('members'), want: googleProducts, failure: T.integrationFailure },
  returns: v.null(),
  handler: async (ctx, p) => {
    const now = await clock.now(ctx, p.familyId);
    for (const offer of offersForProducts(p.want)) await setOfferFailure(ctx, p.familyId, p.memberId, offer, p.failure, now);
    return null;
  },
});

/** Stores (or replaces) a member's Google grant and connects what was granted; schedules the first syncs. */
export const storeGrant = internalMutation({
  args: {
    familyId: v.id('families'),
    memberId: v.id('members'),
    want: googleProducts,
    refreshToken: v.string(),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    scopes: v.array(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.object({ connected: googleProducts }),
  handler: async (ctx, p) => {
    const member = await ctx.db.get(p.memberId);
    if (!member || member.familyId !== p.familyId || !connectorAllowed(member)) return { connected: [] };
    const real = clock.realNow();
    const now = await clock.now(ctx, p.familyId);
    const existing = await ctx.db
      .query('integrationSecrets')
      .withIndex('by_family_member_provider', (q) => q.eq('familyId', p.familyId).eq('memberId', p.memberId).eq('provider', 'google'))
      .unique();
    const secret = {
      accountEmail: p.email,
      refreshToken: p.refreshToken,
      accessToken: p.accessToken,
      accessTokenExpiresAt: p.accessTokenExpiresAt,
      scopes: p.scopes,
      grantedAt: real,
      expectedLapseAt: real + GOOGLE.testingGrantDays * 86_400_000,
    };
    if (existing) await ctx.db.patch(existing._id, secret);
    else await ctx.db.insert('integrationSecrets', { familyId: p.familyId, memberId: p.memberId, provider: 'google', ...secret });

    const connected = await connectGoogleProducts(ctx, { familyId: p.familyId, memberId: p.memberId, want: p.want, grantedScopes: p.scopes, email: p.email, now });
    if (!connected.length) {
      for (const offer of offersForProducts(p.want)) await setOfferFailure(ctx, p.familyId, p.memberId, offer, 'unauthorized', now);
      return { connected: [] };
    }
    // Also revive any of this member's Google integrations that were waiting for a reconnect.
    for (const row of await memberIntegrations(ctx, p.familyId, p.memberId)) {
      if (isGoogleKind(row.kind) && statusOf(row) === 'needs_reconnect' && p.scopes.includes(GOOGLE.scopes[row.kind])) await ctx.db.patch(row._id, { status: 'connected', lastFailure: undefined, lastFailureAt: undefined });
    }
    for (const c of connected) {
      if (c.product === 'gmail') {
        await completeOffer(ctx, { familyId: p.familyId, memberId: p.memberId, offer: 'gmail', outcome: 'connected', now, advanceNow: false });
        await ctx.scheduler.runAfter(0, internal.integrations.syncGmail, { integrationId: c.integrationId, firstLook: true });
        await ctx.scheduler.runAfter(0, internal.gmailPush.renew, { integrationId: c.integrationId });
      } else {
        await completeOffer(ctx, { familyId: p.familyId, memberId: p.memberId, offer: 'calendar', outcome: 'connected', now });
        await ctx.scheduler.runAfter(0, internal.integrations.syncGoogleCalendar, { integrationId: c.integrationId });
      }
    }
    return { connected: connected.map((c) => c.product) };
  },
});

/** Server-only: the member's sealed Google grant (ciphertext). Only actions read it, never a client. */
export const secretFor = internalQuery({
  args: { familyId: v.id('families'), memberId: v.id('members') },
  returns: v.union(v.null(), v.object({ _id: v.id('integrationSecrets'), refreshToken: v.string(), accessToken: v.optional(v.string()), accessTokenExpiresAt: v.optional(v.number()) })),
  handler: async (ctx, { familyId, memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member || member.familyId !== familyId || !connectorAllowed(member)) return null;
    const s = await ctx.db
      .query('integrationSecrets')
      .withIndex('by_family_member_provider', (q) => q.eq('familyId', familyId).eq('memberId', memberId).eq('provider', 'google'))
      .unique();
    return s ? { _id: s._id, refreshToken: s.refreshToken, accessToken: s.accessToken, accessTokenExpiresAt: s.accessTokenExpiresAt } : null;
  },
});

export const saveAccessToken = internalMutation({
  args: { secretId: v.id('integrationSecrets'), accessToken: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { secretId, accessToken, expiresAt }) => {
    if (await ctx.db.get(secretId)) await ctx.db.patch(secretId, { accessToken, accessTokenExpiresAt: expiresAt });
    return null;
  },
});

export const markLapsed = internalMutation({
  args: { familyId: v.id('families'), memberId: v.id('members') },
  returns: v.null(),
  handler: async (ctx, { familyId, memberId }) => {
    await markNeedsReconnect(ctx, familyId, memberId, await clock.now(ctx, familyId));
    return null;
  },
});

export const cleanupStates = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = clock.realNow();
    for (const s of await ctx.db.query('oauthStates').take(500)) if (s.usedAt !== undefined || s.expiresAt < now) await ctx.db.delete(s._id);
    return null;
  },
});

// ---------- internal: sync ----------

export const loadForSync = internalQuery({
  args: { integrationId: v.id('integrations') },
  returns: v.union(v.null(), v.object({ integration: v.any(), status: T.integrationStatus, timezone: v.string(), now: v.number() })),
  handler: async (ctx, { integrationId }) => {
    const row = await ctx.db.get(integrationId);
    if (!row) return null;
    const family = await ctx.db.get(row.familyId);
    if (!family) return null;
    const owner = row.memberId ? await ctx.db.get(row.memberId) : null;
    if (owner && !connectorAllowed(owner)) return null;
    return { integration: row, status: statusOf(row), timezone: family.timezone, now: await clock.now(ctx, row.familyId) };
  },
});

/** v0.17b (C4): takes the integration's sync lease (real time: it guards a process, not a family moment). False
 * while another sync holds it; the holder's result write (`recordSync`) or `releaseSync` frees it. */
export const claimSync = internalMutation({
  args: { integrationId: v.id('integrations') },
  returns: v.boolean(),
  handler: async (ctx, { integrationId }) => {
    const row = await ctx.db.get(integrationId);
    if (!row) return true; // the sync itself reports it gone
    const now = clock.realNow();
    if (row.syncingUntil !== undefined && row.syncingUntil > now) return false;
    await ctx.db.patch(integrationId, { syncingUntil: now + INTEGRATION_SYNC.leaseSeconds * 1000 });
    return true;
  },
});

export const releaseSync = internalMutation({
  args: { integrationId: v.id('integrations') },
  returns: v.null(),
  handler: async (ctx, { integrationId }) => {
    const row = await ctx.db.get(integrationId);
    if (row?.syncingUntil !== undefined) await ctx.db.patch(integrationId, { syncingUntil: undefined });
    return null;
  },
});

export const recordSyncFailure = internalMutation({
  args: { integrationId: v.id('integrations'), failure: T.integrationFailure, firstLook: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { integrationId, failure, firstLook }) => {
    const row = await ctx.db.get(integrationId);
    if (!row) return null;
    const now = await clock.now(ctx, row.familyId);
    await recordSync(ctx, integrationId, { now, failure });
    if (firstLook && row.kind === 'gmail' && row.memberId) await gmailFirstLookDone(ctx, row.familyId, row.memberId, now);
    return null;
  },
});

export const applyEvents = internalMutation({
  args: { integrationId: v.id('integrations'), events: v.array(externalEvent), full: v.optional(windowArg), config: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, { integrationId, events, full, config }) => {
    const row = await ctx.db.get(integrationId);
    if (!row || statusOf(row) !== 'connected') return null; // disconnected meanwhile: write nothing
    await applyExternalEvents(ctx, row, events, { full });
    await recordSync(ctx, integrationId, { now: await clock.now(ctx, row.familyId), config });
    return null;
  },
});

const extractedItem = v.object({
  kind: T.mailItemKind,
  title: v.string(),
  date: v.string(),
  time: v.optional(v.string()),
  amountCents: v.optional(v.number()),
  forFamily: v.boolean(),
});

/** Writes what a Gmail sync found: each item once (message × index), as the owner's private event (dated) or
 * reminder (bills, deliveries, to-dos); proposes a share for family items; posts one `mailFound` card (or, on
 * the first look, "nothing needs you"); saves the sync position; moves onboarding past the Gmail step. */
export const recordMail = internalMutation({
  args: {
    integrationId: v.id('integrations'),
    found: v.array(v.object({ gmailMessageId: v.string(), sourceLabel: v.string(), items: v.array(extractedItem) })),
    decidedBy: v.string(),
    config: v.any(),
    firstLook: v.boolean(),
    schedulingFound: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { integrationId, found, decidedBy, config, firstLook, schedulingFound }) => {
    const row = await ctx.db.get(integrationId);
    if (!row || !row.memberId || statusOf(row) !== 'connected') return null;
    const owner = row.memberId;
    const member = await ctx.db.get(owner);
    if (!member || !connectorAllowed(member)) return null;
    const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', row.familyId)).collect();
    const family = await ctx.db.get(row.familyId);
    if (!family) return null;
    const tz = family.timezone;
    const now = await clock.now(ctx, row.familyId);
    const by = decidedBy as T.DecidedBy;
    const itemIds: Id<'mailItems'>[] = [];
    for (const msg of found) {
      if (runs.length && !runs.some(r => r.active && r.jobs.some(j => j.sourceMessageId === msg.gmailMessageId))) continue;
      const already = await ctx.db
        .query('mailItems')
        .withIndex('by_integration_message', (q) => q.eq('integrationId', integrationId).eq('gmailMessageId', msg.gmailMessageId))
        .collect();
      for (const [index, item] of msg.items.entries()) {
        if (already.some((a) => a.itemIndex === index)) continue;
        let eventId: Id<'events'> | undefined;
        let reminderId: Id<'reminders'> | undefined;
        if (item.kind === 'event') {
          const start = item.time ? localDateTimeToInstant(`${item.date}T${item.time}`, tz) : zonedInstant(item.date, 0, tz);
          eventId = await ctx.db.insert('events', {
            familyId: row.familyId,
            title: item.title,
            start,
            ...(item.time ? {} : { allDay: item.date, end: zonedInstant(addDays(item.date, 1), 0, tz) }),
            who: [owner],
            source: 'gmail',
            externalId: `${msg.gmailMessageId}#${index}`,
            integrationId,
            createdBy: owner,
            ownerId: owner,
            scope: 'personal',
            cancelled: false,
          });
        } else {
          reminderId = await ctx.db.insert('reminders', {
            familyId: row.familyId,
            forMemberId: owner,
            text: item.title,
            dueAt: localDateTimeToInstant(`${item.date}T${item.time ?? GMAIL.reminderAt}`, tz),
            done: false,
            createdBy: owner,
          });
        }
        const itemId = await ctx.db.insert('mailItems', {
          familyId: row.familyId,
          memberId: owner,
          integrationId,
          gmailMessageId: msg.gmailMessageId,
          itemIndex: index,
          kind: item.kind,
          title: item.title,
          sourceLabel: msg.sourceLabel,
          when: item.time ? `${item.date}T${item.time}` : item.date,
          ...(item.amountCents !== undefined ? { amountCents: item.amountCents } : {}),
          ...(eventId ? { eventId } : {}),
          ...(reminderId ? { reminderId } : {}),
          status: 'added',
          foundAt: now,
          decidedBy: by,
        });
        itemIds.push(itemId);
        // A school/kids item may matter to the household: ASK the owner (never applied without their tap).
        if (item.forFamily && eventId) {
          const ev = (await ctx.db.get(eventId))!;
          await suggestShare(ctx, { familyId: row.familyId, ownerId: owner, item: { kind: 'event', eventId }, preview: eventPreview(ev, tz), decidedBy: by, now });
        }
      }
    }
    await recordSync(ctx, integrationId, { now, config });
    if (itemIds.length) await postCard(ctx, { familyId: row.familyId, recipientId: owner, card: { kind: 'mailFound', integrationId, itemIds }, now });
    else if (firstLook && !schedulingFound) await sayAsOwnMega(ctx, row.familyId, owner, fillCopy(G5_COPY.foundNone, { days: ONBOARDING.gmailFirstLookDays }), now);
    if (firstLook) await gmailFirstLookDone(ctx, row.familyId, owner, now);
    return null;
  },
});

export const saveIcs = internalMutation({
  args: { url: v.string(), label: v.string(), host: v.string(), etag: v.optional(v.string()), lastModified: v.optional(v.string()), events: v.array(externalEvent), window: windowArg },
  returns: v.id('integrations'),
  handler: async (ctx, p) => {
    const viewer = await requireViewer(ctx);
    requireConnector(viewer.member);
    const familyId = viewer.member.familyId;
    const now = await clock.now(ctx, familyId);
    const mine = (await memberIntegrations(ctx, familyId, viewer.member._id)).filter((r) => r.kind === 'ics' && statusOf(r) !== 'disconnected');
    const same = mine.find((r) => (r.config as { url?: string })?.url === p.url);
    if (!same && mine.length >= ICS.maxFeedsPerMember) fail('VALIDATION', 'too many schedule links');
    const integrationId = await upsertIntegration(ctx, {
      familyId,
      memberId: viewer.member._id,
      kind: 'ics',
      config: { url: p.url, etag: p.etag, lastModified: p.lastModified },
      label: p.label,
      host: p.host,
      now,
      match: (r) => (r.config as { url?: string })?.url === p.url || (statusOf(r) === 'disconnected' && !(r.config as { url?: string })?.url),
    });
    await applyExternalEvents(ctx, (await ctx.db.get(integrationId))!, p.events, { full: p.window });
    await recordSync(ctx, integrationId, { now });
    await completeOffer(ctx, { familyId, memberId: viewer.member._id, offer: 'ics', outcome: 'connected', now });
    return integrationId;
  },
});

export const syncGmail = internalAction({
  args: { integrationId: v.id('integrations'), firstLook: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { integrationId, firstLook }) => {
    await syncGmailCore(ctx, integrationId, firstLook ?? false);
    return null;
  },
});

export const syncGoogleCalendar = internalAction({
  args: { integrationId: v.id('integrations') },
  returns: v.null(),
  handler: async (ctx, { integrationId }) => {
    await syncGoogleCalendarCore(ctx, integrationId);
    return null;
  },
});

export const syncIcs = internalAction({
  args: { integrationId: v.id('integrations') },
  returns: v.null(),
  handler: async (ctx, { integrationId }) => {
    await syncIcsCore(ctx, integrationId);
    return null;
  },
});

/** Cron: schedules a sync for every connected integration of a kind (Google ones only with a stored grant),
 * spread out a second apart. */
export const pollKind = internalMutation({
  args: { kind: v.union(v.literal('gmail'), v.literal('googleCalendar'), v.literal('ics')) },
  returns: v.null(),
  handler: async (ctx, { kind }) => {
    const rows = await ctx.db
      .query('integrations')
      .withIndex('by_kind_status', (q) => q.eq('kind', kind).eq('status', 'connected'))
      .collect();
    let i = 0;
    for (const row of rows) {
      if (!row.memberId) continue;
      if ((GOOGLE_KINDS as readonly string[]).includes(kind)) {
        const secret = await ctx.db
          .query('integrationSecrets')
          .withIndex('by_family_member_provider', (q) => q.eq('familyId', row.familyId).eq('memberId', row.memberId!).eq('provider', 'google'))
          .unique();
        if (!secret) continue; // display-only rows (the seed's) are never polled
      }
      const fn = kind === 'gmail' ? internal.integrations.syncGmail : kind === 'googleCalendar' ? internal.integrations.syncGoogleCalendar : internal.integrations.syncIcs;
      await ctx.scheduler.runAfter(1000 * i++, fn, { integrationId: row._id });
    }
    return null;
  },
});
