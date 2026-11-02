import { v } from 'convex/values';
import { internalAction, internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { clock } from './ports/clock';
import { connectorAllowed, memberIntegrations, statusOf } from './model/integrations';
import { writePermissions } from './model/scheduling';
import { postOwnMegaMessage } from './model/threads';
import { requireViewer } from './model/viewer';
import { fail } from './model/errors';
import { accessTokenFor } from './model/googleAccess';
import { sha256Hex } from './model/random';
import { getMailScheduling } from './adapters/registry';
import { SCHEDULING } from '../shared/config/scheduling';
import { API } from '../shared/domain/api';
import { pick } from './model/define';
import { demoGate, demoRunForSource } from './model/demoConsole';
import { canAnswerScheduling } from './model/schedulingRequests';

export const retry = mutation({ ...pick(API.requests.syncCalendar), handler: async (ctx, { requestId }) => {
  const viewer = await requireViewer(ctx);
  const r = await ctx.db.get(requestId);
  if (!r || r.toMemberId !== viewer.member._id || r.familyId !== viewer.member.familyId || !r.scheduling?.calendarAuthorized) fail('FORBIDDEN');
  await ctx.scheduler.runAfter(0, internal.participantCalendar.sync, { requestId });
  return null;
} });

export const claim = internalMutation({ args: { requestId: v.id('requests') }, handler: async (ctx, { requestId }): Promise<{ request: Doc<'requests'>; plan: Doc<'mailPlans'>; attempt: number; cancelled: boolean; demoRunKey?: string } | null> => {
  const r = await ctx.db.get(requestId);
  if (!r?.scheduling?.calendarAuthorized) return null;
  const p = await ctx.db.get(r.scheduling.planId);
  const member = await ctx.db.get(r.toMemberId);
  if (!p || p.familyId !== r.familyId || p.ownerId !== r.fromMemberId || !p.selected || !member || member.familyId !== r.familyId || !(await connectorAllowed(ctx, member)) || !await canAnswerScheduling(ctx, member)) return null;
  if (!r.scheduling.acceptedSlot || r.scheduling.acceptedSlot.start !== p.selected.start || r.scheduling.acceptedSlot.end !== p.selected.end) return null;
  const cancelled = p.status === 'cancelled';
  if (!cancelled && (p.status !== 'confirmed' || r.status !== 'accepted' || !p.participantIds.includes(r.toMemberId))) return null;
  if (cancelled && !r.scheduling.calendarExternalId) return null;
  if (r.scheduling.calendarOperation === 'running' || (r.scheduling.calendarOperation === 'done' && !!r.scheduling.calendarCancelled === cancelled)) return null;
  if (!(await writePermissions(ctx, p.familyId, r.toMemberId)).canWriteCalendar) {
    await ctx.db.patch(r._id, { scheduling: { ...r.scheduling, calendarOperation: 'failed' } });
    await postOwnMegaMessage(ctx, r.familyId, r.toMemberId, { type: 'text', text: `You’re confirmed for ${p.title}, but I need your Google Calendar connection before I can add it. Open Email & scheduling, then retry the calendar update on this request.` }, await clock.now(ctx, r.familyId));
    return null;
  }
  const attempt = (r.scheduling.calendarAttempt ?? 0) + 1;
  await ctx.db.patch(r._id, { scheduling: { ...r.scheduling, calendarOperation: 'running', calendarAttempt: attempt } });
  await ctx.scheduler.runAfter(SCHEDULING.operationTimeoutSeconds * 1000, internal.participantCalendar.finish, { requestId, attempt, ok: false, cancelled });
  return { request: r, plan: p, attempt, cancelled, demoRunKey: await demoRunForSource(ctx, p.familyId, p.sourceMessageId) };
} });

export const finish = internalMutation({ args: { requestId: v.id('requests'), attempt: v.number(), ok: v.boolean(), cancelled: v.boolean(), externalId: v.optional(v.string()) }, handler: async (ctx, { requestId, attempt, ok, cancelled, externalId }) => {
  const r = await ctx.db.get(requestId);
  if (!r?.scheduling || r.scheduling.calendarAttempt !== attempt || r.scheduling.calendarOperation === 'done') return;
  const p = await ctx.db.get(r.scheduling.planId);
  if (!p?.selected) return;
  const now = await clock.now(ctx, r.familyId);
  if (!ok || !externalId) {
    if (r.scheduling.calendarOperation === 'uncertain') return;
    await ctx.db.patch(r._id, { scheduling: { ...r.scheduling, calendarOperation: 'uncertain' } });
    await postOwnMegaMessage(ctx, r.familyId, r.toMemberId, { type: 'text', text: `I couldn’t confirm the calendar update for ${p.title}. Use Retry calendar update on this request; I’ll check the same event so it won’t be duplicated.` }, now);
    return;
  }
  const integration = (await memberIntegrations(ctx, r.familyId, r.toMemberId)).find(i => i.kind === 'googleCalendar' && statusOf(i) === 'connected');
  if (!integration) { await ctx.db.patch(r._id, { scheduling: { ...r.scheduling, calendarOperation: 'uncertain', calendarExternalId: externalId } }); return; }
  const existing = await ctx.db.query('events').withIndex('by_integration_external', q => q.eq('integrationId', integration._id).eq('externalId', externalId)).unique();
  const eventId = existing?._id ?? await ctx.db.insert('events', { familyId: r.familyId, title: p.title, ...r.scheduling.acceptedSlot!, who: [r.toMemberId], ownerId: r.toMemberId, createdBy: r.toMemberId, source: 'google', externalId, integrationId: integration._id, scope: 'personal', cancelled });
  await ctx.db.patch(eventId, { cancelled });
  await ctx.db.patch(r._id, { scheduling: { ...r.scheduling, calendarOperation: 'done', calendarExternalId: externalId, calendarEventId: eventId, calendarCancelled: cancelled } });
  if (p.status === 'cancelled' && !cancelled) { await ctx.scheduler.runAfter(0, internal.participantCalendar.sync, { requestId }); return; }
  await postOwnMegaMessage(ctx, r.familyId, r.toMemberId, { type: 'text', text: cancelled ? `I removed ${p.title} from your calendar because the meeting was cancelled.` : `You’re all set for ${p.title}! I added the time you accepted to your Google Calendar.` }, now);
} });

export const sync = internalAction({ args: { requestId: v.id('requests') }, returns: v.null(), handler: async (ctx, { requestId }): Promise<null> => {
  const work = await ctx.runMutation(internal.participantCalendar.claim, { requestId });
  if (!work) return null;
  const { request: r, plan: p, attempt, cancelled } = work;
  const externalId = r.scheduling!.calendarExternalId ?? `mega${await sha256Hex(`${p._id}:${r._id}`)}`;
  let ok = false;
  try {
    const token = await accessTokenFor(ctx, r.familyId, r.toMemberId);
    if (token.ok) ok = (await getMailScheduling().hold({ accessToken: token.accessToken, id: externalId, planKey: p._id, demoRunKey: work.demoRunKey, title: p.title, slot: p.selected!, confirmed: true, cancelled })).ok;
  } catch { /* A retry uses the same owned provider event. */ }
  await ctx.runMutation(internal.participantCalendar.finish, { requestId, attempt, ok, externalId, cancelled });
  return null;
} });

/** The presenter requested retroactive calendar completion for an already accepted demo meeting. */
export const repairDemo = internalMutation({ args: { runId: v.id('demoRuns') }, handler: async (ctx, { runId }) => {
  demoGate();
  const run = await ctx.db.get(runId);
  if (!run?.active) fail('NOT_FOUND');
  const requests = await ctx.db.query('requests').withIndex('by_family_to', q => q.eq('familyId', run.familyId)).collect();
  const repaired: string[] = [];
  for (const r of requests) {
    if (r.status !== 'accepted' || !r.scheduling) continue;
    const p = await ctx.db.get(r.scheduling.planId);
    if (!p?.selected || p.status !== 'confirmed' || !run.jobs.some(j => j.sourceMessageId === p.sourceMessageId)) continue;
    await ctx.db.patch(r._id, { scheduling: { ...r.scheduling, calendarAuthorized: true, acceptedSlot: p.selected } });
    await ctx.scheduler.runAfter(0, internal.participantCalendar.sync, { requestId: r._id });
    repaired.push(r._id);
  }
  return repaired;
} });
