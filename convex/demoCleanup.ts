import { googleReturnOrigin } from './model/googleReturnOrigin';
import type { SyncOutcome } from './model/integrationSync';
import { GOOGLE } from '../shared/config/google';
import { connectorAllowed } from './model/integrations';
import { getGoogleOAuth } from './adapters/registry';
import { googleRedirectUri, exchangeAndStore } from './integrations';
import { randomToken } from './model/random';
import { clock } from './ports/clock';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, mutation, internalQuery, internalMutation } from './_generated/server';
import { API } from '../shared/domain/api';
import { pick } from './model/define';
import { ownedRun, demoPeople } from './model/demoConsole';
import { DEMO_SCENARIO, DEMO_CLEANUP } from '../shared/config/demo';
import { SCHEDULING } from '../shared/config/scheduling';
import { accessTokenFor } from './model/googleAccess';
import { clearDemoGoogle } from './adapters/demoCleanup';
import { fail } from './model/errors';
import { requestsForPlan } from './model/schedulingRequests';

export const targets = internalMutation({ args: { runId: v.id('demoRuns') }, handler: async (ctx, { runId }) => {
  const run = await ownedRun(ctx, runId);
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  if (runs.some(r => r.jobs.some(j => ['sending', 'uncertain'].includes(j.status)))) fail('VALIDATION', 'Resolve in-flight or uncertain email delivery before cleanup.');
  const ids = new Set(runs.flatMap(r => r.jobs.map(j => j.sourceMessageId).filter(Boolean)));
  const plans = (await ctx.db.query('mailPlans').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect()).filter(p => ids.has(p.sourceMessageId));
  if (plans.some(p => ['running','uncertain'].includes(p.replyOperation ?? '') || ['running','uncertain'].includes(p.calendarOperation ?? '') || ['running','uncertain'].includes(p.draftOperation ?? ''))) fail('VALIDATION', 'Resolve pending Google operations before cleanup.');
  const requests = (await Promise.all(plans.map(p => requestsForPlan(ctx, run.familyId, p._id)))).flat();
  if (requests.some(r => r.scheduling?.calendarOperation === 'running' || r.scheduling?.calendarOperation === 'uncertain')) fail('VALIDATION', 'Resolve participant calendar updates before cleanup.');
  const rows = await ctx.db.query('integrations').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  const accounts = [];
  for (const persona of DEMO_SCENARIO.personas) {
    const row = rows.find(r => r.kind === 'gmail' && r.status === 'connected' && r.label === persona.email);
    if (!row?.memberId) { accounts.push({ email: persona.email, memberId: null, ready: false }); continue; }
    const grant = await ctx.db.query('integrationSecrets').withIndex('by_family_member_provider', q => q.eq('familyId', run.familyId).eq('memberId', row.memberId!).eq('provider', 'google')).unique();
    accounts.push({ email: persona.email, memberId: row.memberId, ready: !!grant?.scopes.includes(DEMO_CLEANUP.gmailScope) && !!grant?.scopes.includes(SCHEDULING.scopes.calendar) });
  }
  // Preflight all accounts before modifying any data.
  const missing = accounts.filter(a => !a.ready);
  if (missing.length) fail('VALIDATION', `Authorize demo cleanup in Google setup for: ${missing.map(a => a.email).join(', ')}. No cleanup was started.`);
  for (const r of runs) await ctx.db.patch(r._id, { cleanupPaused: true, jobs: r.jobs.map(j => j.status === 'queued' ? { ...j, status: 'cancelled' as const } : j) });
  for (const p of plans) await ctx.db.patch(p._id, { status: 'dismissed', revision: p.revision + 1 });
  return { familyId: run.familyId, accounts, plans: [...plans.map(p => ({ id: p._id, ownerId: p.ownerId, calendarExternalId: p.calendarExternalId, draftId: p.draftId })), ...requests.filter(r => r.scheduling?.calendarExternalId).map(r => ({ id: r.scheduling!.planId, ownerId: r.toMemberId, calendarExternalId: r.scheduling!.calendarExternalId, draftId: undefined }))] };
} });
export const cleared = internalMutation({ args: { runId: v.id('demoRuns'), memberId: v.id('members') }, handler: async (ctx, { runId, memberId }) => {
  const run = await ownedRun(ctx, runId);
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  const ids = new Set(runs.flatMap(r => r.jobs.map(j => j.sourceMessageId).filter(Boolean)));
  const plans = await ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', run.familyId).eq('ownerId', memberId)).collect();
  for (const p of plans.filter(p => ids.has(p.sourceMessageId))) {
    if (p.eventId && p.ownsEvent && await ctx.db.get(p.eventId)) await ctx.db.patch(p.eventId, { cancelled: true });
    await ctx.db.patch(p._id, { calendarExternalId: undefined, draftId: undefined, calendarOperation: undefined, draftOperation: undefined, status: 'dismissed' });
  }
  const familyPlans = await ctx.db.query('mailPlans').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  const requests = (await Promise.all(familyPlans.filter(p => ids.has(p.sourceMessageId)).map(p => requestsForPlan(ctx, run.familyId, p._id)))).flat();
  for (const r of requests.filter(r => r.toMemberId === memberId && r.scheduling)) {
    if (r.scheduling!.calendarEventId && await ctx.db.get(r.scheduling!.calendarEventId!)) await ctx.db.patch(r.scheduling!.calendarEventId!, { cancelled: true });
    await ctx.db.patch(r._id, { scheduling: { ...r.scheduling!, calendarExternalId: undefined, calendarOperation: undefined, calendarAuthorized: false } });
  }
  // Keep the console available for a retry or explicit restart; old emails remain rejected.
  // Restart story creates a fresh run and resumes delivery after cleanup.

} });
export const clear = action({ ...pick(API.demoCleanup.clear), handler: async (ctx, { runId }): Promise<string> => {
  const target = await ctx.runMutation(internal.demoCleanup.targets, { runId });
  const reports: string[] = [];
  for (const account of target.accounts) {
    try {
      const token = await accessTokenFor(ctx, target.familyId, account.memberId!);
      if (!token.ok) throw new Error('Reconnect this test account.');
      const result = await clearDemoGoogle(token.accessToken, account.email, target.plans.filter(p => p.ownerId === account.memberId));
      reports.push(`${account.email}: ${result.mailCount} emails moved to Trash; ${result.eventCount} calendar events removed.${result.error ? ` ${result.error}` : ''}`);
      if (!result.error) await ctx.runMutation(internal.demoCleanup.cleared, { runId, memberId: account.memberId! });
    } catch (error) { reports.push(`${account.email}: ${error instanceof Error ? error.message : 'Cleanup failed. Retry.'}`); }
  }
  return reports.join('\n');
} });


async function authorizationTarget(ctx: QueryCtx, runId: Id<'demoRuns'>, persona: string) {
  const run = await ownedRun(ctx, runId);
  const person = (await demoPeople(ctx, run)).find(p => p.key === persona);
  if (!person?.member) fail('VALIDATION', 'Create this demo family member first.');
  if (!(await connectorAllowed(ctx, person.member))) fail('VALIDATION', 'Approve this teen’s account connections in Family first.');
  return { familyId: run.familyId, memberId: person.member._id, expectedEmail: person.email };
}
export const authorizationTargetQuery = internalQuery({ args: { runId: v.id('demoRuns'), persona: v.string() }, handler: (ctx, args) => authorizationTarget(ctx, args.runId, args.persona) });
export const authorizeStart = mutation({ ...pick(API.demoCleanup.authorizeStart), handler: async (ctx, { runId, persona, returnOrigin }) => {
  const target = await authorizationTarget(ctx, runId, persona);
  const redirectUri = googleRedirectUri();
  if (!redirectUri) fail('VALIDATION', 'Google setup is unavailable.');
  const { token, hash } = await randomToken();
  const now = clock.realNow();
  await ctx.db.insert('oauthStates', { returnOrigin: googleReturnOrigin(returnOrigin), ...target, nonceHash: hash, want: ['gmail', 'googleCalendar'], createdAt: now, expiresAt: now + GOOGLE.stateTtlMinutes * 60_000 });
  return { authUrl: getGoogleOAuth().authUrl({ scopes: [...GOOGLE.identityScopes, ...Object.values(GOOGLE.scopes), ...Object.values(SCHEDULING.scopes), DEMO_CLEANUP.gmailScope], state: token, redirectUri, loginHint: target.expectedEmail }) };
} });
export const authorizeCode = action({ ...pick(API.demoCleanup.authorizeCode), handler: async (ctx, { runId, persona, serverAuthCode }): Promise<SyncOutcome> => {
  const target = await ctx.runQuery(internal.demoCleanup.authorizationTargetQuery, { runId, persona });
  const result = await exchangeAndStore(ctx, { ...target, want: ['gmail', 'googleCalendar'], code: serverAuthCode, redirectUri: '' });
  return { status: result.status };
} });
