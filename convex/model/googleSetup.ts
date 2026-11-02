import { memberAgeGroup } from './memberAge';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import { postOwnMegaMessage } from './threads';
import { googleAvailable } from './tokenVault';
import { clock } from '../ports/clock';
import { fail } from './errors';
import { memberIntegrations, statusOf, connectorAllowed } from './integrations';
import { preferenceFor } from './scheduling';
import { internal } from '../_generated/api';
import { GOOGLE_CHECK, INTEGRATION_SYNC } from '../../shared/config/google';

/** Only the current owner's capability metadata; never tokens or another person's inbox. */
export async function googleConnectionContext(ctx: QueryCtx | MutationCtx, member: Doc<'members'>) {
  const rows = await memberIntegrations(ctx, member.familyId, member._id);
  const prefs = await preferenceFor(ctx, member.familyId, member._id);
  return {
    allowed: (await connectorAllowed(ctx, member)),
    products: ['gmail', 'googleCalendar'].map(kind => {
      const row = rows.find(r => r.kind === kind);
      return { kind, status: row ? statusOf(row) : 'not_connected', lastSyncAt: row?.lastSyncAt ?? null, lastFailure: row?.lastFailure ?? null };
    }),
    recognitionEnabled: prefs?.enabled ?? false,
    automaticCapture: prefs?.autoCapture ?? false,
  };
}

export async function requestGoogleCheck(ctx: MutationCtx, member: Doc<'members'>, threadId: Id<'threads'>) {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.ownerId !== member._id || thread.familyId !== member.familyId) fail('FORBIDDEN');
  if (!(await connectorAllowed(ctx, member))) return 'Account access requires parent approval for this member. Use Google setup to request approval; do not read accounts.';
  const rows = await memberIntegrations(ctx, member.familyId, member._id);
  const gmail = rows.find(r => r.kind === 'gmail');
  if (!gmail || statusOf(gmail) !== 'connected') return 'Gmail is not connected or needs reconnection. Use google_setup.';
  const now = clock.realNow();
  const recent = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', member.familyId).eq('threadId', threadId)).order('desc').take(20);
  if (recent.some(m => m.body.type === 'notice' && m.body.text === 'Checking your Inbox and calendar…' && m._creationTime > now - GOOGLE_CHECK.pollMs * (GOOGLE_CHECK.maxPolls + 5))) return 'Your check is already running. Its status message will update when it finishes.';
  const sources: { id: Id<'integrations'>; previousSync?: number; needsFresh: boolean }[] = [];
  let queued = 0;
  for (const row of rows.filter(r => ['gmail', 'googleCalendar'].includes(r.kind) && statusOf(r) === 'connected')) {
    const running = (row.syncingUntil ?? 0) > now;
    const recentSync = !row.lastFailure && row.lastSyncAt !== undefined && now - row.lastSyncAt < INTEGRATION_SYNC.syncNowMinSeconds * 1000;
    sources.push({ id: row._id, previousSync: row.lastSyncAt, needsFresh: running || !recentSync });
    if (running || recentSync) continue;
    await ctx.scheduler.runAfter(0, row.kind === 'gmail' ? internal.integrations.syncGmail : internal.integrations.syncGoogleCalendar, { integrationId: row._id });
    queued++;
  }
  const messageId = await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'notice', text: 'Checking your Inbox and calendar…' }, await clock.now(ctx, member.familyId));
  if (messageId) await ctx.scheduler.runAfter(GOOGLE_CHECK.pollMs, internal.googleChecks.complete, { messageId, memberId: member._id, startedAt: now, attempt: 0, sources });
  return (queued ? 'Requested an Inbox/calendar check using the existing connections.' : 'A check is already running or the sources were checked within the last minute.') + ' This is not a completed scan result. New relevant findings appear in chat through the existing processing flow. Do not claim the inbox is empty, that you read a specific email, or that an event was added without results. Spam is excluded. Existing consent and automatic-capture settings remain unchanged.';
}

/** Offers the existing consent UI; never connects, grants access, or changes settings. */
export async function offerGoogleSetup(ctx: MutationCtx, member: Doc<'members'>, threadId: Id<'threads'>, now: number): Promise<string> {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.ownerId !== member._id || thread.familyId !== member.familyId) fail('FORBIDDEN');
  if ((await memberAgeGroup(ctx, member)) === 'child') return 'Children under 13 cannot connect Google accounts. A parent can correct the age group in Family if it is wrong.';
  if (!googleAvailable()) return 'Google connections are not configured on this deployment. Do not claim that MEGA lacks Google support generally.';
  const state = await googleConnectionContext(ctx, member);
  const status = JSON.stringify(state);
  const connected = state.products.every(p => p.status === 'connected');
  if (connected) return `Gmail and Google Calendar are already connected. No repeat Google consent is needed to check email/calendar. Use google_check for an inbox check. Settings contains Google setup if the person explicitly wants to change permissions. Current state: ${status}`;
  const recent = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', member.familyId).eq('threadId', threadId)).order('desc').take(8);
  if (!recent.some(m => m.body.type === 'card' && m.body.card.kind === 'connect' && m.body.card.offer === 'gmail')) {
    const id = await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'card', card: { kind: 'connect', offer: 'gmail' } }, now);
    if (!id) return 'The member needs their own MEGA before the setup card can be shown.';
  }
  return 'Google setup is available in the connection card in this chat. It opens one setup for Gmail, Calendar, optional holds/drafts and availability sharing. The person must review it and consent through Google. A teen without approval can request it from their parent there. Nothing is connected or shared by showing this card.';
}
