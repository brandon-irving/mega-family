import { requestsForPlan } from './model/schedulingRequests';
import { sharesAvailability } from './model/schedulingSharing';
import { postOwnMegaMessage } from './model/threads';
import { demoGate, demoIngestAllowed, demoRunForSource } from './model/demoConsole';
import { cancelSchedulingRequests, confirmAcceptedSelection, requestSchedulingConfirmation } from './model/schedulingCoordination';
import { connectorAllowed } from './model/integrations';
import { availabilitySharingMode, schedulingReply } from '../shared/scheduling';
import { v } from 'convex/values';
import { API } from '../shared/domain/api';
import { SCHEDULING } from '../shared/config/scheduling';
import { emailPlan, timeSlot, type TimeSlot } from '../shared/domain/scheduling';
import { formatLocalDateTime } from '../shared/time';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { query, mutation, action, internalQuery, internalMutation, internalAction, type ActionCtx, type MutationCtx } from './_generated/server';
import { pick } from './model/define';
import { requireViewer } from './model/viewer';
import { fail } from './model/errors';
import { buildPlanView, ownPlan, preferenceFor, recordEmailPlans, writePermissions } from './model/scheduling';
import { memberIntegrations, requireConnector, statusOf } from './model/integrations';
import { syncGoogleCalendar, syncIcs } from './model/integrationSync';
import { accessTokenFor } from './model/googleAccess';
import { GMAIL } from '../shared/config/google';
import { getMailScheduling, getMailSource } from './adapters/registry';
import { sha256Hex } from './model/random';
import { clock } from './ports/clock';

export const preferences = query({ ...pick(API.scheduling.preferences), handler: async ctx => {
  const { member } = await requireViewer(ctx); await requireConnector(ctx, member);
  const prefs = await preferenceFor(ctx, member.familyId, member._id);
  const people = await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', member.familyId)).collect();
  const integrations = await memberIntegrations(ctx, member.familyId, member._id);
  const gmail = integrations.find(i => i.kind === 'gmail' && statusOf(i) === 'connected');
  const eligible = (await Promise.all(people.map(async m => ({ member: m, allowed: m._id !== member._id && await connectorAllowed(ctx, m) })))).filter(r => r.allowed).map(r => r.member);
  const mode = availabilitySharingMode(prefs);
  return { availabilitySharing: mode, desiredWrites: prefs?.desiredWrites, configured: !!prefs, gmailConnected: !!gmail, calendarConnected: integrations.some(i => i.kind === 'googleCalendar' && statusOf(i) === 'connected'), enabled: prefs?.enabled ?? false, autoCapture: prefs?.autoCapture ?? false, availabilityFor: eligible.filter(m => mode === 'family' || (mode === 'custom' && prefs?.availabilityFor.includes(m._id))).map(m => m._id),
    people: await Promise.all(eligible.map(async m => ({ id: m._id, name: m.name, sharesWithMe: await sharesAvailability(ctx, await preferenceFor(ctx, member.familyId, m._id), member._id) }))),
    ...await writePermissions(ctx, member.familyId, member._id),
    detection: !gmail ? 'disconnected' as const : (gmail.watchExpiresAt ?? 0) > clock.realNow() && !gmail.watchFailure && !!gmail.lastMailPushAt ? 'push' as const : 'polling' as const };
} });
async function validateSharing(ctx: MutationCtx, member: Doc<'members'>, availabilityFor: Id<'members'>[]) {
  if (availabilityFor.length > SCHEDULING.maxParticipants) fail('VALIDATION');
  for (const id of availabilityFor) { const m = await ctx.db.get(id); if (!m || m.familyId !== member.familyId || !(await connectorAllowed(ctx, m)) || id === member._id) fail('VALIDATION'); }
}
export const setSharing = mutation({ ...pick(API.scheduling.setSharing), handler: async (ctx, args) => {
  const { member } = await requireViewer(ctx); await requireConnector(ctx, member);
  const mode = availabilitySharingMode(args);
  const availabilityFor = mode === 'custom' ? args.availabilityFor : [];
  await validateSharing(ctx, member, availabilityFor);
  const prefs = await preferenceFor(ctx, member.familyId, member._id);
  if (!prefs) fail('VALIDATION', 'Complete Google setup before changing sharing.');
  await ctx.db.patch(prefs._id, { availabilitySharing: mode, availabilityFor: [...new Set(availabilityFor)] });
  return null;
} });
export const setPreferences = mutation({ ...pick(API.scheduling.setPreferences), handler: async (ctx, args) => {
  const { member } = await requireViewer(ctx); await requireConnector(ctx, member);
  const mode = availabilitySharingMode(args);
  const availabilityFor = mode === 'custom' ? args.availabilityFor : [];
  await validateSharing(ctx, member, availabilityFor);
  const p = await preferenceFor(ctx, member.familyId, member._id);
  const fields = { ...args, availabilitySharing: mode, availabilityFor: [...new Set(availabilityFor)] };
  if (p) await ctx.db.patch(p._id, fields); else await ctx.db.insert('schedulingPreferences', { ...fields, memberId: member._id, familyId: member.familyId });
  if (args.enabled) for (const i of await memberIntegrations(ctx, member.familyId, member._id)) if (i.kind === 'gmail' && statusOf(i) === 'connected') await ctx.scheduler.runAfter(0, internal.gmailPush.renew, { integrationId: i._id });
  return null;
} });
export const get = query({ ...pick(API.scheduling.get), handler: async (ctx, { planId }) => buildPlanView(ctx, await ownPlan(ctx, (await requireViewer(ctx)).member, planId)) });
export const list = query({ ...pick(API.scheduling.list), handler: async ctx => {
  const { member } = await requireViewer(ctx); await requireConnector(ctx, member);
  const plans = await ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', member.familyId).eq('ownerId', member._id)).order('desc').take(30);
  return plans.filter(p => !['dismissed', 'cancelled'].includes(p.status)).map(p => ({ id: p._id, title: p.title, status: p.status }));
} });
export const dismiss = mutation({ ...pick(API.scheduling.dismiss), handler: async (ctx, { planId }) => {
  const p = await ownPlan(ctx, (await requireViewer(ctx)).member, planId);
  if (p.replyOperation === 'running' || p.replyOperation === 'uncertain' || p.calendarOperation === 'running' || p.draftOperation === 'running') fail('VALIDATION', 'An action is still running.');
  if (p.eventId && p.ownsEvent && !p.calendarExternalId) {
    const e = await ctx.db.get(p.eventId); if (e?.scope === 'personal' && e.ownerId === p.ownerId) await ctx.db.delete(e._id);
  }
  await cancelSchedulingRequests(ctx, p, await clock.now(ctx, p.familyId));
  if (p.calendarExternalId && p.ownsEvent) {
    await ctx.db.patch(p._id, { status: 'cancelled', revision: p.revision + 1, calendarOperation: 'uncertain' });
    await ctx.scheduler.runAfter(0, internal.scheduling.reconcileInternal, { planId: p._id, revision: p.revision + 1 });
  } else await ctx.db.patch(p._id, { status: 'dismissed', revision: p.revision + 1 });
  return null;
} });

export const extractionContext = internalQuery({ args: { integrationId: v.id('integrations'), threadId: v.string() }, handler: async (ctx, { integrationId, threadId }) => {
  const row = await ctx.db.get(integrationId); if (!row?.memberId) return null;
  const prefs = await preferenceFor(ctx, row.familyId, row.memberId); if (!prefs?.enabled) return null;
  const owner = await ctx.db.get(row.memberId); if (!owner || !(await connectorAllowed(ctx, owner))) return null;
  const roster = await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', row.familyId)).collect();
  const names = (await Promise.all(roster.map(async m => ({ name: m.name, allowed: await connectorAllowed(ctx, m) })))).filter(m => m.allowed).map(m => m.name);
  const previous = await ctx.db.query('mailPlans').withIndex('by_thread', q => q.eq('integrationId', integrationId).eq('threadId', threadId)).unique();
  const family = await ctx.db.get(row.familyId);
  return { ownerName: owner.name, names, ...(previous ? { previous: JSON.stringify({ title: previous.title, status: previous.status, slots: previous.slots.map(s => ({ start: formatLocalDateTime(s.start, family!.timezone), end: formatLocalDateTime(s.end, family!.timezone) })), selected: previous.selected ? { start: formatLocalDateTime(previous.selected.start, family!.timezone), end: formatLocalDateTime(previous.selected.end, family!.timezone) } : null }) } : {}) };
} });
export const ingest = internalMutation({ args: { integrationId: v.id('integrations'), messageId: v.string(), threadId: v.string(), at: v.number(), label: v.string(), plans: v.array(emailPlan), reprocess: v.optional(v.boolean()) }, returns: v.null(), handler: async (ctx, args) => {
  const row = await ctx.db.get(args.integrationId);
  if (row && !await demoIngestAllowed(ctx, row.familyId, args.messageId)) return null;
  const owner = row?.memberId ? await ctx.db.get(row.memberId) : null;
  if (row && owner && (await connectorAllowed(ctx, owner)) && statusOf(row) === 'connected') await recordEmailPlans(ctx, row, args, args.plans, args.reprocess);
  return null;
} });
export const refreshSources = internalQuery({ args: { planId: v.id('mailPlans'), checkCaller: v.optional(v.boolean()) }, handler: async (ctx, { planId, checkCaller }) => {
  const p = checkCaller ? await ownPlan(ctx, (await requireViewer(ctx)).member, planId) : await ctx.db.get(planId);
  if (!p) return [];
  const sources: { id: Id<'integrations'>; kind: 'googleCalendar' | 'ics' }[] = [];
  for (const id of p.participantIds) {
    if (id !== p.ownerId) { const prefs = await preferenceFor(ctx, p.familyId, id); if (!prefs?.enabled || !await sharesAvailability(ctx, prefs, p.ownerId)) continue; }
    for (const i of await memberIntegrations(ctx, p.familyId, id)) if (statusOf(i) === 'connected' && (i.kind === 'googleCalendar' || i.kind === 'ics')) sources.push({ id: i._id, kind: i.kind });
  }
  return sources;
} });
async function refreshPlan(ctx: ActionCtx, planId: Id<'mailPlans'>, checkCaller = false): Promise<void> {
  const sources: { id: Id<'integrations'>; kind: 'googleCalendar' | 'ics' }[] = await ctx.runQuery(internal.scheduling.refreshSources, { planId, checkCaller });
  await Promise.all(sources.map(i => i.kind === 'googleCalendar' ? syncGoogleCalendar(ctx, i.id, true) : syncIcs(ctx, i.id)));
}
export const refresh = action({ ...pick(API.scheduling.refresh), handler: async (ctx, { planId }): Promise<null> => { await refreshPlan(ctx, planId, true); return null; } });
export const refreshInternal = internalAction({ args: { planId: v.id('mailPlans') }, returns: v.null(), handler: async (ctx, { planId }): Promise<null> => { await refreshPlan(ctx, planId); return null; } });

const operation = v.union(v.literal('calendar'), v.literal('draft'));
async function beginOperation(ctx: MutationCtx, p: Doc<'mailPlans'>, op: 'calendar' | 'draft') {
  const field = op === 'calendar' ? 'calendarOperation' : 'draftOperation';
  const counter = op === 'calendar' ? 'calendarAttempt' : 'draftAttempt';
  const attempt = (p[counter] ?? 0) + 1;
  await ctx.db.patch(p._id, { [field]: 'running', [counter]: attempt, operationRevision: p.revision });
  await ctx.scheduler.runAfter(SCHEDULING.operationTimeoutSeconds * 1000, internal.scheduling.expireOperation, { planId: p._id, operation: op, attempt });
  return { ...p, [field]: 'running' as const, [counter]: attempt };
}
export const expireOperation = internalMutation({ args: { planId: v.id('mailPlans'), operation, attempt: v.number() }, returns: v.null(), handler: async (ctx, { planId, operation, attempt }) => {
  const p = await ctx.db.get(planId);
  const field = operation === 'calendar' ? 'calendarOperation' : 'draftOperation';
  const counter = operation === 'calendar' ? 'calendarAttempt' : 'draftAttempt';
  if (p?.[field] === 'running' && p[counter] === attempt) await ctx.db.patch(planId, { [field]: 'uncertain' });
  return null;
} });
export const claim = internalMutation({ args: { planId: v.id('mailPlans'), revision: v.number(), operation, slot: v.optional(timeSlot) }, handler: async (ctx, { planId, revision, operation, slot }): Promise<(Doc<'mailPlans'> & { demoRunKey?: string }) | null> => {
  const p = await ownPlan(ctx, (await requireViewer(ctx)).member, planId);
  if (p.revision !== revision) fail('VALIDATION', 'This email changed. Review the latest plan.');
  const pref = await preferenceFor(ctx, p.familyId, p.ownerId); if (!pref?.enabled) fail('FORBIDDEN');
  const integration = await ctx.db.get(p.integrationId); if (!integration || statusOf(integration) !== 'connected') fail('VALIDATION', 'Reconnect your email.');
  const field = operation === 'calendar' ? 'calendarOperation' : 'draftOperation';
  if (p[field] === 'running' || p[field] === 'done') return null;
  if (operation === 'draft' && p[field] === 'uncertain') fail('VALIDATION', 'Check the connected app; the previous action may have completed.');
  const view = await buildPlanView(ctx, p);
  if (operation === 'calendar') {
    if (!view.canWriteCalendar) fail('VALIDATION', 'Enable Google holds in scheduling settings.');
    if (!['proposed', 'review'].includes(p.status) || !slot || !view.slots.some(s => s.start === slot.start && s.end === slot.end && s.available)) fail('VALIDATION', 'This time is no longer available, or some details need review.');
    await ctx.db.patch(p._id, { selected: slot });
  } else {
    if (!view.canWriteDraft || p.status !== 'held' || !p.selected) fail('VALIDATION', 'Choose a time and enable Gmail drafts first.');
  }
  return { ...await beginOperation(ctx, p, operation), demoRunKey: await demoRunForSource(ctx, p.familyId, p.sourceMessageId), ...(slot ? { selected: slot } : {}) };
} });
export const finish = internalMutation({ args: { planId: v.id('mailPlans'), revision: v.number(), operation, attempt: v.number(), result: v.union(v.object({ ok: v.literal(true), id: v.string() }), v.object({ ok: v.literal(false), uncertain: v.boolean() })) }, returns: v.null(), handler: async (ctx, { planId, revision, operation, attempt, result }) => {
  const p = await ctx.db.get(planId); if (!p) return null;
  const field = operation === 'calendar' ? 'calendarOperation' : 'draftOperation';
  if (p[operation === 'calendar' ? 'calendarAttempt' : 'draftAttempt'] !== attempt) return null;
  if (p.revision !== revision) { await ctx.db.patch(p._id, { [field]: 'uncertain', ...(result.ok ? operation === 'calendar' ? { calendarExternalId: result.id } : { draftId: result.id } : {}) }); return null; }
  if (!result.ok) { await ctx.db.patch(p._id, { [field]: result.uncertain ? 'uncertain' : 'failed' }); return null; }
  if (operation === 'draft') { await ctx.db.patch(p._id, { draftId: result.id, draftOperation: 'done' }); return null; }
  const selected = p.selected!;
  const now = await clock.now(ctx, p.familyId);
  const external = (await memberIntegrations(ctx, p.familyId, p.ownerId)).find(i => i.kind === 'googleCalendar' && statusOf(i) === 'connected');
  if (!external) { await ctx.db.patch(p._id, { calendarOperation: 'uncertain', calendarExternalId: result.id }); return null; }
  const existing = await ctx.db.query('events').withIndex('by_integration_external', q => q.eq('integrationId', external._id).eq('externalId', result.id)).unique();
  const eventId = existing?._id ?? await ctx.db.insert('events', { familyId: p.familyId, title: p.title, ...selected, who: [p.ownerId], ownerId: p.ownerId, createdBy: p.ownerId, source: 'google', externalId: result.id, integrationId: external._id, scope: 'personal', cancelled: false });
  await ctx.db.patch(p._id, { eventId, ownsEvent: true, status: 'held', calendarExternalId: result.id, calendarOperation: 'done', updatedAt: now });
  const held = (await ctx.db.get(p._id))!;
  await requestSchedulingConfirmation(ctx, held, now);
  await confirmAcceptedSelection(ctx, held, now);
  return null;
} });
export const hold = action({ ...pick(API.scheduling.hold), handler: async (ctx, { planId, revision, start, end }): Promise<null> => {
  await refreshPlan(ctx, planId, true);
  const p = await ctx.runMutation(internal.scheduling.claim, { planId, revision, operation: 'calendar', slot: { start, end } });
  if (!p) return null;
  let result: import('./ports/mailScheduling').WriteResult = { ok: false, uncertain: false };
  try {
    const token = await accessTokenFor(ctx, p.familyId, p.ownerId);
    if (token.ok) result = await getMailScheduling().hold({ accessToken: token.accessToken, id: `mega${await sha256Hex(p._id)}`, planKey: p._id, demoRunKey: p.demoRunKey, title: p.title, slot: { start, end }, confirmed: false });
  } catch { result = { ok: false, uncertain: true }; }
  await ctx.runMutation(internal.scheduling.finish, { planId, revision, operation: 'calendar', attempt: p.calendarAttempt!, result });
  return null;
} });
export const draft = action({ ...pick(API.scheduling.draft), handler: async (ctx, { planId, revision }): Promise<null> => {
  const p: Doc<'mailPlans'> | null = await ctx.runMutation(internal.scheduling.claim, { planId, revision, operation: 'draft' });
  if (!p) return null;
  let result: import('./ports/mailScheduling').WriteResult = { ok: false, uncertain: false };
  try {
    const token = await accessTokenFor(ctx, p.familyId, p.ownerId);
    if (token.ok) {
      const source = await getMailSource().getMessage({ accessToken: token.accessToken, id: p.sourceMessageId, maxBodyChars: 0 });
      const context = await ctx.runQuery(internal.integrations.loadForSync, { integrationId: p.integrationId });
      if (source.ok && context && p.selected) {
        const text = schedulingReply(p.selected, context.timezone);
        result = await getMailScheduling().draft({ accessToken: token.accessToken, threadId: p.threadId, to: source.message.replyTo ?? source.message.fromAddress, subject: source.message.subject, body: text, replyToMessageId: source.message.rfcMessageId, messageId: `${await sha256Hex(`${p._id}:${revision}`)}@mega.local` });
      }
    }
  } catch { result = { ok: false, uncertain: true }; }
  await ctx.runMutation(internal.scheduling.finish, { planId, revision, operation: 'draft', attempt: p.draftAttempt!, result });
  return null;
} });

export const claimCalendarUpdate = internalMutation({ args: { planId: v.id('mailPlans'), revision: v.number(), automatic: v.boolean() }, handler: async (ctx, { planId, revision, automatic }): Promise<Doc<'mailPlans'> | null> => {
  const p = automatic ? await ctx.db.get(planId) : await ownPlan(ctx, (await requireViewer(ctx)).member, planId);
  if (!p || p.revision !== revision || !p.calendarExternalId || !p.ownsEvent || !['confirmed', 'cancelled'].includes(p.status) || p.missing.length) return null;
  if (p.calendarOperation === 'running' || p.calendarOperation === 'done') return null;
  const prefs = await preferenceFor(ctx, p.familyId, p.ownerId);
  if (!prefs?.enabled || !(await writePermissions(ctx, p.familyId, p.ownerId)).canWriteCalendar) return null;
  if (p.status === 'confirmed' && p.slots.length !== 1) return null;
  return beginOperation(ctx, p, 'calendar');
} });
export const finishCalendarUpdate = internalMutation({ args: { planId: v.id('mailPlans'), revision: v.number(), attempt: v.number(), ok: v.boolean() }, returns: v.null(), handler: async (ctx, { planId, revision, attempt, ok }) => {
  const p = await ctx.db.get(planId);
  if (p?.calendarAttempt === attempt && p.calendarOperation !== 'done') {
    await ctx.db.patch(planId, { calendarOperation: ok && p.revision === revision ? 'done' : 'uncertain' });
    if (ok && p.revision === revision && p.status === 'confirmed') {
      const now = await clock.now(ctx, p.familyId);
      await postOwnMegaMessage(ctx, p.familyId, p.ownerId, { type: 'text', text: p.confirmedBySelection ? `${p.title} is confirmed! I updated your calendar for the time you both agreed to. The organizer offered this time, so no further confirmation is needed. You can still reply to let them know which time you chose.` : `The organizer confirmed ${p.title}. I updated your calendar from tentative to confirmed.` }, now);
      const requests = await requestsForPlan(ctx, p.familyId, p._id);
      for (const r of requests.filter(r => r.scheduling?.planId === p._id && r.status === 'accepted' && r.scheduling.calendarAuthorized)) {
        await ctx.scheduler.runAfter(0, internal.participantCalendar.sync, { requestId: r._id });
      }
    }
    if (ok && p.revision === revision && p.status === 'cancelled') {
      const requests = await requestsForPlan(ctx, p.familyId, p._id);
      for (const r of requests.filter(r => r.scheduling?.planId === p._id && r.scheduling.calendarExternalId)) await ctx.scheduler.runAfter(0, internal.participantCalendar.sync, { requestId: r._id });
    }
    if (ok && p.revision === revision && p.status === 'cancelled' && p.eventId && p.ownsEvent && await ctx.db.get(p.eventId)) await ctx.db.patch(p.eventId, { cancelled: true });
  }
  return null;
} });
async function reconcile(ctx: ActionCtx, planId: Id<'mailPlans'>, revision: number, automatic: boolean): Promise<null> {
  const p: Doc<'mailPlans'> | null = await ctx.runMutation(internal.scheduling.claimCalendarUpdate, { planId, revision, automatic });
  if (!p) return null;
  let ok = false;
  try {
    const token = await accessTokenFor(ctx, p.familyId, p.ownerId);
    const slot = p.status === 'confirmed' ? p.slots[0] : p.selected;
    if (token.ok && slot) ok = (await getMailScheduling().hold({ accessToken: token.accessToken, id: p.calendarExternalId!, planKey: p._id, title: p.title, slot, confirmed: p.status === 'confirmed', cancelled: p.status === 'cancelled' })).ok;
  } catch { /* Stable external event ID makes reconciliation safe to retry after review. */ }
  await ctx.runMutation(internal.scheduling.finishCalendarUpdate, { planId, revision, attempt: p.calendarAttempt!, ok });
  return null;
}
export const syncCalendar = action({ ...pick(API.scheduling.syncCalendar), handler: async (ctx, { planId, revision }): Promise<null> => reconcile(ctx, planId, revision, false) });
export const reconcileInternal = internalAction({ args: { planId: v.id('mailPlans'), revision: v.number() }, returns: v.null(), handler: async (ctx, { planId, revision }): Promise<null> => reconcile(ctx, planId, revision, true) });

/** Repair only the selected demo run: replay missing requests and finish previously requested dismissals. */
export const repairDemoCoordination = internalMutation({ args: { runId: v.id('demoRuns') }, handler: async (ctx, { runId }) => {
  demoGate();
  const run = await ctx.db.get(runId); if (!run?.active) fail('NOT_FOUND');
  const sources = new Set(run.jobs.map(j => j.sourceMessageId));
  const plans = await ctx.db.query('mailPlans').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  const repaired: string[] = [];
  for (const p of plans.filter(p => sources.has(p.sourceMessageId))) {
    if (p.status === 'held') { await requestSchedulingConfirmation(ctx, p, await clock.now(ctx, p.familyId)); repaired.push('confirmation'); }
    if (p.status === 'dismissed' && p.ownsEvent && p.calendarExternalId && p.selected && p.calendarOperation !== 'running') {
      await ctx.db.patch(p._id, { status: 'cancelled', revision: p.revision + 1, calendarOperation: 'uncertain' });
      await ctx.scheduler.runAfter(0, internal.scheduling.reconcileInternal, { planId: p._id, revision: p.revision + 1 });
      repaired.push('cancel-dismissed-hold');
    }
  }
  return repaired;
} });

export const replyContext = internalQuery({ args: { planId: v.id('mailPlans'), revision: v.number() }, handler: async (ctx, { planId, revision }) => {
  const p = await ownPlan(ctx, (await requireViewer(ctx)).member, planId);
  const view = await buildPlanView(ctx, p);
  if (p.revision !== revision || !view.canSendReply || !view.canWriteDraft || !p.selected) fail('VALIDATION', 'Confirm the family’s time and enable Gmail replies first.');
  return { p, body: schedulingReply(p.selected, view.timezone, p.confirmedBySelection) };
} });
async function reviewedReply(ctx: ActionCtx, planId: Id<'mailPlans'>, revision: number): Promise<{ p: Doc<'mailPlans'>; token: string; to: string; subject: string; body: string; replyToMessageId?: string }> {
  const { p, body } = await ctx.runQuery(internal.scheduling.replyContext, { planId, revision });
  const token = await accessTokenFor(ctx, p.familyId, p.ownerId);
  if (!token.ok) fail('VALIDATION', 'Reconnect Gmail.');
  const source = await getMailSource().getMessage({ accessToken: token.accessToken, id: p.sourceMessageId, maxBodyChars: 0 });
  if (!source.ok) fail('VALIDATION', 'Could not load the original email.');
  return { p, token: token.accessToken, to: source.message.replyTo ?? source.message.fromAddress, subject: /^re:/i.test(source.message.subject) ? source.message.subject : `Re: ${source.message.subject}`, body, replyToMessageId: source.message.rfcMessageId };
}
export const previewReply = action({ ...pick(API.scheduling.previewReply), handler: async (ctx, { planId, revision }) => {
  const r = await reviewedReply(ctx, planId, revision);
  return { to: r.to, subject: r.subject, body: r.body };
} });
export const claimReply = internalMutation({ args: { planId: v.id('mailPlans'), revision: v.number() }, handler: async (ctx, { planId, revision }) => {
  const p = await ownPlan(ctx, (await requireViewer(ctx)).member, planId);
  const view = await buildPlanView(ctx, p);
  if (p.revision !== revision || !view.canSendReply || !view.canWriteDraft) fail('VALIDATION', 'This proposal has changed.');
  if (p.replyOperation === 'done' || p.replyOperation === 'running') return null;
  if (p.replyOperation === 'uncertain') fail('VALIDATION', 'Check Gmail Sent before trying again. Delivery is uncertain.');
  const attempt = (p.replyAttempt ?? 0) + 1;
  await ctx.db.patch(planId, { replyOperation: 'running', replyAttempt: attempt });
  await ctx.scheduler.runAfter(SCHEDULING.operationTimeoutSeconds * 1000, internal.scheduling.finishReply, { planId, attempt, result: { ok: false, uncertain: true } });
  return attempt;
} });
export const finishReply = internalMutation({ args: { planId: v.id('mailPlans'), attempt: v.number(), result: v.union(v.object({ ok: v.literal(true), id: v.string() }), v.object({ ok: v.literal(false), uncertain: v.boolean() })) }, handler: async (ctx, { planId, attempt, result }) => {
  const p = await ctx.db.get(planId);
  if (!p || p.replyAttempt !== attempt || !['running', 'uncertain'].includes(p.replyOperation ?? '')) return;
  await ctx.db.patch(planId, { replyOperation: result.ok ? 'done' : result.uncertain ? 'uncertain' : 'failed', ...(result.ok ? { replyMessageId: result.id } : {}) });
  if (result.ok) await postOwnMegaMessage(ctx, p.familyId, p.ownerId, { type: 'text', text: p.confirmedBySelection ? 'Your reply was sent to the organizer. Your chosen time is already confirmed on your calendar.' : 'Your reply was sent to the organizer. I’ll watch for their confirmation and update your calendar.' }, await clock.now(ctx, p.familyId));
} });
export const sendReply = action({ ...pick(API.scheduling.sendReply), handler: async (ctx, args): Promise<null> => {
  const r = await reviewedReply(ctx, args.planId, args.revision);
  if (r.to !== args.to || r.subject !== args.subject || r.body !== args.body) fail('VALIDATION', 'The email changed. Review the reply again.');
  const attempt = await ctx.runMutation(internal.scheduling.claimReply, { planId: args.planId, revision: args.revision });
  if (attempt === null) return null;
  let result: import('./ports/mailScheduling').WriteResult = { ok: false, uncertain: true };
  try { result = await getMailScheduling().send({ accessToken: r.token, threadId: r.p.threadId, to: r.to, subject: r.subject, body: r.body, replyToMessageId: r.replyToMessageId, messageId: `${await sha256Hex(`${r.p._id}:${args.revision}:reply`)}@mega.local` }); } catch { /* Never retry an ambiguous provider send. */ }
  await ctx.runMutation(internal.scheduling.finishReply, { planId: args.planId, attempt, result });
  return null;
} });

/** Read the original email again; only a review plan in the active demo may be repaired. */
export const reprocessTarget = internalQuery({ args: { planId: v.id('mailPlans') }, handler: async (ctx, { planId }) => {
  demoGate();
  const p = await ctx.db.get(planId);
  if (!p || p.status !== 'review') fail('VALIDATION');
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', p.familyId)).collect();
  if (!runs.some(r => r.active && r.jobs.some(j => j.sourceMessageId === p.sourceMessageId))) fail('FORBIDDEN');
  return p;
} });
export const reprocessDemo = internalAction({ args: { planId: v.id('mailPlans') }, returns: v.null(), handler: async (ctx, { planId }): Promise<null> => {
  const p = await ctx.runQuery(internal.scheduling.reprocessTarget, { planId });
  const token = await accessTokenFor(ctx, p.familyId, p.ownerId);
  if (!token.ok) fail('VALIDATION', 'Reconnect the inbox.');
  const source = await getMailSource().getMessage({ accessToken: token.accessToken, id: p.sourceMessageId, maxBodyChars: GMAIL.maxBodyChars });
  if (!source.ok) fail('VALIDATION', 'Could not read the original email.');
  const load = await ctx.runQuery(internal.integrations.loadForSync, { integrationId: p.integrationId });
  const context = await ctx.runQuery(internal.scheduling.extractionContext, { integrationId: p.integrationId, threadId: p.threadId });
  if (!load || !context) fail('FORBIDDEN');
  const { extractItems } = await import('./model/mailExtract');
  const result = await extractItems(ctx, p.familyId, source.message, load.timezone, load.now, context);
  if (result.plans.length) await ctx.runMutation(internal.scheduling.ingest, { integrationId: p.integrationId, messageId: p.sourceMessageId, threadId: p.threadId, at: p.sourceAt, label: p.sourceLabel, plans: result.plans, reprocess: true });
  return null;
} });
