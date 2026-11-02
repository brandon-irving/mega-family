import { v } from 'convex/values';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { SCHEDULING } from '../shared/config/scheduling';
import { internalAction, internalMutation, internalQuery, httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { accessTokenFor } from './model/googleAccess';
import { statusOf } from './model/integrations';
import { getMailScheduling } from './adapters/registry';
import { syncGmail } from './model/integrationSync';
import { clock } from './ports/clock';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGmailPush(authorization: string | null, keys: JWTVerifyGetKey = googleKeys): Promise<boolean> {
  const audience = process.env[SCHEDULING.env.audience];
  const email = process.env[SCHEDULING.env.serviceAccount];
  if (!audience || !email || !authorization?.startsWith('Bearer ')) return false;
  try {
    const { payload } = await jwtVerify(authorization.slice(7), keys, { audience, issuer: ['https://accounts.google.com', 'accounts.google.com'], algorithms: ['RS256'] });
    return payload.email === email && payload.email_verified === true;
  } catch { return false; }
}
export const push = httpAction(async (ctx, request) => {
  if (!await verifyGmailPush(request.headers.get('Authorization'))) return new Response(null, { status: 401 });
  try {
    const reader = request.body?.getReader(); if (!reader) return new Response(null, { status: 400 });
    let raw = '', bytes = 0;
    const decoder = new TextDecoder();
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > SCHEDULING.webhookMaxBytes) { await reader.cancel(); return new Response(null, { status: 413 }); } raw += decoder.decode(part.value, { stream: true }); }
    raw += decoder.decode();
    const body = JSON.parse(raw);
    const data = JSON.parse(atob(body.message?.data ?? ''));
    if (typeof data.emailAddress !== 'string' || data.emailAddress.length > 254 || !/^\d+$/.test(data.historyId)) return new Response(null, { status: 400 });
    // Persist a wakeup before acknowledging. Never advance Gmail's history cursor from this notification.
    await ctx.runMutation(internal.gmailPush.receive, { email: data.emailAddress.toLowerCase() });
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
});
export const receive = internalMutation({ args: { email: v.string() }, returns: v.null(), handler: async (ctx, { email }) => {
  const rows = await ctx.db.query('integrations').withIndex('by_kind_label', q => q.eq('kind', 'gmail').eq('label', email)).collect();
  for (const row of rows) {
    if (statusOf(row) !== 'connected' || !row.memberId) continue;
    await ctx.db.patch(row._id, { lastMailPushAt: clock.realNow(), mailWakeVersion: (row.mailWakeVersion ?? 0) + 1, mailWakeQueued: true, mailWakeUntil: !row.mailWakeQueued || (row.mailWakeUntil ?? 0) <= clock.realNow() ? clock.realNow() + SCHEDULING.pushLeaseSeconds * 1000 : row.mailWakeUntil });
    if (!row.mailWakeQueued || (row.mailWakeUntil ?? 0) <= clock.realNow()) await ctx.scheduler.runAfter(0, internal.gmailPush.drain, { integrationId: row._id, attempt: 0 });
  }
  return null;
} });
export const state = internalQuery({ args: { integrationId: v.id('integrations') }, handler: async (ctx, { integrationId }) => ctx.db.get(integrationId) });
export const drained = internalMutation({ args: { integrationId: v.id('integrations'), version: v.number(), retry: v.boolean(), attempt: v.number() }, returns: v.null(), handler: async (ctx, { integrationId, version, retry, attempt }) => {
  const row = await ctx.db.get(integrationId); if (!row) return null;
  const more = row.mailWakeVersion !== version || retry || !!(row.config as { pending?: string[] })?.pending?.length;
  if (statusOf(row) === 'connected' && more && attempt < SCHEDULING.pushMaxRetries) {
    await ctx.db.patch(integrationId, { mailWakeUntil: clock.realNow() + SCHEDULING.pushLeaseSeconds * 1000 });
    await ctx.scheduler.runAfter(SCHEDULING.pushRetrySeconds * 1000, internal.gmailPush.drain, { integrationId, attempt: attempt + 1 });
  } else await ctx.db.patch(integrationId, { mailWakeQueued: false, mailWakeUntil: undefined }); // regular sync remains the recovery path
  return null;
} });
export const drain = internalAction({ args: { integrationId: v.id('integrations'), attempt: v.number() }, returns: v.null(), handler: async (ctx, { integrationId, attempt }): Promise<null> => {
  const row = await ctx.runQuery(internal.gmailPush.state, { integrationId }); if (!row) return null;
  let retry = (row.syncingUntil ?? 0) > clock.realNow();
  if (!retry && statusOf(row) === 'connected') {
    try { const result = await syncGmail(ctx, integrationId); retry = !!result.failure; } catch { retry = true; }
  }
  await ctx.runMutation(internal.gmailPush.drained, { integrationId, version: row.mailWakeVersion ?? 0, retry, attempt });
  return null;
} });
export const watchResult = internalMutation({ args: { integrationId: v.id('integrations'), expiresAt: v.optional(v.number()) }, returns: v.null(), handler: async (ctx, { integrationId, expiresAt }) => {
  const row = await ctx.db.get(integrationId);
  if (row && statusOf(row) === 'connected') await ctx.db.patch(integrationId, { watchExpiresAt: expiresAt, watchFailure: !expiresAt });
  return null;
} });
export const renew = internalAction({ args: { integrationId: v.id('integrations') }, returns: v.null(), handler: async (ctx, { integrationId }): Promise<null> => {
  const topic = process.env[SCHEDULING.env.topic];
  if (!topic || !process.env[SCHEDULING.env.audience] || !process.env[SCHEDULING.env.serviceAccount]) return null;
  const row = await ctx.runQuery(internal.gmailPush.state, { integrationId });
  if (!row?.memberId || row.kind !== 'gmail' || statusOf(row) !== 'connected') return null;
  if ((row.watchExpiresAt ?? 0) > clock.realNow() + SCHEDULING.watchRenewBeforeHours * 3_600_000) return null;
  const token = await accessTokenFor(ctx, row.familyId, row.memberId);
  const result = token.ok ? await getMailScheduling().watch({ accessToken: token.accessToken, topic }) : null;
  await ctx.runMutation(internal.gmailPush.watchResult, { integrationId, ...(result ? { expiresAt: result.expiresAt } : {}) });
  return null;
} });
export const renewAll = internalMutation({ args: {}, returns: v.null(), handler: async ctx => {
  const rows = await ctx.db.query('integrations').withIndex('by_kind_status', q => q.eq('kind', 'gmail').eq('status', 'connected')).collect();
  for (const row of rows) await ctx.scheduler.runAfter(0, internal.gmailPush.renew, { integrationId: row._id });
  return null;
} });
