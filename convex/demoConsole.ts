import { DEMO_CLEANUP } from '../shared/config/demo';
import { SCHEDULING } from '../shared/config/scheduling';
import { GMAIL } from '../shared/config/google';
import { googleGet, withQuery } from './adapters/googleHttp';
import { ageGroupFromBrief } from '../shared/ageGroups';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { accessTokenFor } from './model/googleAccess';
import { removeDemoGoogleArtifact } from './adapters/googleScheduling';
import { v } from 'convex/values';
import { API } from '../shared/domain/api';
import { DEMO_SCENARIO as C } from '../shared/config/demo';
import { demoEmail, demoText } from '../shared/demoScenario';
import { action, mutation, query, internalAction, internalMutation, internalQuery } from './_generated/server';
import { pick } from './model/define';
import { demoGate, freshConsole, newRun, ownedRun, resolveDemoPeople, demoPeople } from './model/demoConsole';
import { requireMember, requireAdmin } from './model/viewer';
import { fail } from './model/errors';
import { clock } from './ports/clock';
import { statusOf } from './model/integrations';
import { preferenceFor, writePermissions } from './model/scheduling';
import { addFamilyMember } from './model/familyAdd';
import { saveBrief } from './model/assistantBriefs';
import { demoStage } from '../shared/domain/demoConsole';

export const start = mutation({ ...pick(API.demoConsole.start), handler: async (ctx, { expectedMemberId }) => {
  demoGate(); const m = await requireMember(ctx); requireAdmin(m.role);
  if (m._id !== expectedMemberId) return null;
  await freshConsole(ctx); return null;
} });
export const state = query({ ...pick(API.demoConsole.state), handler: async ctx => {
  demoGate(); const m = await requireMember(ctx); requireAdmin(m.role);
  const run = (await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', m.familyId)).collect()).find(r => r.active && r.ownerAuthId === m.authId && r.adminId === m._id);
  if (!run) return null;
  const members = await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', m.familyId)).collect();
  const integrations = await ctx.db.query('integrations').withIndex('by_family', q => q.eq('familyId', m.familyId)).collect();
  const plans = await ctx.db.query('mailPlans').withIndex('by_family', q => q.eq('familyId', m.familyId)).collect();
  const people = resolveDemoPeople(members, integrations, run.adminId);
  const names = Object.fromEntries(people.map(p => [p.key, p.name]));
  const personas = await Promise.all(people.map(async p => {
    const member = p.member;
    const rows = integrations.filter(i => i.memberId === member?._id && i.label?.toLowerCase() === p.email && statusOf(i) === 'connected');
    const gmail = rows.find(i => i.kind === 'gmail');
    const pref = member ? await preferenceFor(ctx, m.familyId, member._id) : null;
    const writes = member ? await writePermissions(ctx, m.familyId, member._id) : null;
    const other = people.find(x => x.key === (p.key === 'dad' ? 'mom' : 'dad'))?.member;
    const grant = member ? await ctx.db.query('integrationSecrets').withIndex('by_family_member_provider', q => q.eq('familyId', run.familyId).eq('memberId', member._id).eq('provider', 'google')).unique() : null;
    const cleanupReady = !!gmail && !!grant?.scopes.includes(DEMO_CLEANUP.gmailScope) && !!grant?.scopes.includes(SCHEDULING.scopes.calendar);
    return { cleanupReady, key: p.key, name: p.name, email: p.email, memberId: member?._id, joined: member?.joinedAt !== undefined, gmail: !!gmail, calendar: rows.some(i => i.kind === 'googleCalendar'), recognition: !!pref?.enabled, autoCapture: !!pref?.autoCapture, push: !!gmail?.lastMailPushAt && !gmail.watchFailure && (gmail.watchExpiresAt ?? 0) > clock.realNow(), writes: !!writes?.canWriteCalendar && !!writes.canWriteDraft, sharesAvailability: !!other && !!pref?.availabilityFor.includes(other._id) };
  }));
  const stages = C.stages.map(s => {
    const jobs = run.jobs.filter(j => j.stage === s.key); const job = jobs.at(-1); const attempt = job?.attempt ?? 0;
    const sourceIds = new Set(jobs.map(j => j.sourceMessageId).filter(Boolean));
    const matched = plans.filter(p => sourceIds.has(p.sourceMessageId));
    return { key: s.key, title: demoText(s.title, names), ...demoEmail(run.key, run.date, s.key, attempt + 1, names), attempt, status: job?.status ?? 'ready', received: !!job?.receivedAt, plans: matched.length, events: matched.filter(p => p.eventId).length, error: job?.error };
  });
  return { runId: run._id, key: run.key, date: run.date, workerReady: (run.workerAt ?? 0) > clock.realNow() - C.workerFreshMs, sender: run.sender, personas, stages };
} });
/** Optional rehearsal shortcut. Real invites and recipient acceptance still follow normal UI. */
export const prepare = mutation({ ...pick(API.demoConsole.prepare), handler: async (ctx, { runId }) => {
  const run = await ownedRun(ctx, runId); if (!run.active) return null;
  const admin = (await ctx.db.get(run.adminId))!;
  if (!admin.name) fail('VALIDATION', 'Introduce yourself to MEGA in Chat first.');
  for (const p of C.personas.slice(1)) {
    if ((await demoPeople(ctx, run)).find(person => person.key === p.key)?.member) continue;
    const id = await addFamilyMember(ctx, admin, { name: p.name, role: p.key === 'daughter' ? 'kid' : 'adult', relationship: p.key === 'mom' ? 'partner' : 'daughter', ...(p.key === 'daughter' ? { birthday: `${Number(run.date.slice(0,4))-16}-01-01` } : {}), mega: { name: p.key === 'mom' ? 'Teal' : 'Violet', look: { hex: p.key === 'mom' ? '#2FB8B0' : '#8B6DE0', sticker: 'none' }, personality: 'calm' } }, clock.realNow());
    if (p.key === 'mom') {
      const names = Object.fromEntries((await demoPeople(ctx, run)).map(person => [person.key, person.name]));
      await saveBrief(ctx, admin, (await ctx.db.get(id))!, { ...C.momBrief, context: demoText(C.momBrief.context, names), goals: demoText(C.momBrief.goals, names) }, clock.realNow());
    }
  }
  return null;
} });
export const trigger = mutation({ ...pick(API.demoConsole.trigger), handler: async (ctx, { runId, stage, expectedAttempt }) => {
  const run = await ownedRun(ctx, runId); if (run.cleanupPaused) fail('VALIDATION', 'Restart the story after cleanup before sending more emails.'); if (!run.active) fail('VALIDATION', 'This run is closed.');
  const previous = run.jobs.filter(j => j.stage === stage).at(-1);
  if ((previous?.attempt ?? 0) !== expectedAttempt || previous?.status === 'queued' || previous?.status === 'sending') return null;
  if (previous?.status === 'uncertain') fail('VALIDATION', 'Delivery is uncertain. Verify the mailbox before starting a new run.');
  if ((run.workerAt ?? 0) < clock.realNow() - C.workerFreshMs) fail('VALIDATION', 'Start npm run demo:runner on the demo computer.');
  const spec = C.stages.find(s => s.key === stage)!; const persona = C.personas.find(p => p.key === spec.recipient)!;
  const people = await demoPeople(ctx, run);
  const member = people.find(p => p.key === persona.key)?.member;
  if (!member) fail('VALIDATION', 'Create this family member first.');
  const gmail = await ctx.db.query('integrations').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  const pref = await preferenceFor(ctx, run.familyId, member._id);
  if (!gmail.some(i => i.memberId === member._id && i.kind === 'gmail' && i.label?.toLowerCase() === persona.email && statusOf(i) === 'connected') || !pref?.enabled) fail('VALIDATION', 'Connect the expected Gmail account and enable recognition for this person.');
  if (run.jobs.length >= 30) fail('VALIDATION', 'Restart the story before sending more emails.');
  await ctx.db.patch(runId, { jobs: [...run.jobs, { stage, attempt: expectedAttempt + 1, status: 'queued', queuedAt: clock.realNow(), email: demoEmail(run.key, run.date, stage, expectedAttempt + 1, Object.fromEntries(people.map(p => [p.key, p.name]))) }] }); return null;
} });
/** Restart only tracked local artifacts. External writes must be removed before restarting. */
export const reset = mutation({ ...pick(API.demoConsole.reset), handler: async (ctx, { runId, mode }) => {
  const run = await ownedRun(ctx, runId); if (!run.active) return null;
  if (run.jobs.some(j => j.status === 'sending' || j.status === 'uncertain')) fail('VALIDATION', 'Resolve the in-flight or uncertain email first.');
  const ids = new Set(run.jobs.map(j => j.sourceMessageId).filter(Boolean));
  const plans = (await ctx.db.query('mailPlans').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect()).filter(p => ids.has(p.sourceMessageId));
  if (plans.some(p => p.calendarExternalId || p.draftId || p.calendarOperation === 'running' || p.draftOperation === 'running')) fail('VALIDATION', 'This run has Google artifacts. Use Cleanup Google artifacts before restarting.');
  for (const p of plans) {
    if (p.eventId && p.ownsEvent) await ctx.db.delete(p.eventId);
    if (p.messageId) await ctx.db.delete(p.messageId);
    await ctx.db.delete(p._id);
  }
  const mailItems = await ctx.db.query('mailItems').withIndex('by_family_member_found', q => q.eq('familyId', run.familyId)).collect();
  for (const item of mailItems.filter(item => ids.has(item.gmailMessageId))) {
    if (item.eventId && await ctx.db.get(item.eventId)) await ctx.db.delete(item.eventId);
    if (item.reminderId && await ctx.db.get(item.reminderId)) await ctx.db.delete(item.reminderId);
    await ctx.db.delete(item._id);
  }
  await ctx.db.patch(runId, { active: false, jobs: run.jobs.map(j => j.status === 'queued' ? { ...j, status: 'cancelled' as const } : j) });
  if (mode === 'onboarding') await freshConsole(ctx);
  else await newRun(ctx, run.familyId, run.adminId, run.ownerAuthId);
  return null;
} });

/** Local Composio runner only, authenticated by Convex deployment credentials. No client endpoint. */
export const claim = internalMutation({ args: { sender: v.string() }, handler: async (ctx, { sender }) => {
  demoGate(); if (!C.personas.some(p => p.email === sender)) fail('FORBIDDEN', 'Runner must use a configured test mailbox.');
  const now = clock.realNow();
  const runs = await ctx.db.query('demoRuns').withIndex('by_active', q => q.eq('active', true)).collect();
  let claimed = null;
  for (const run of runs) {
    if (run.cleanupPaused) continue;
    const jobs = run.jobs.map(j => j.status === 'sending' && (j.claimedAt ?? 0) < now - C.sendTimeoutMs ? { ...j, status: 'uncertain' as const, error: 'Runner stopped before confirming delivery. No automatic resend.' } : j);
    const index: number = claimed ? -1 : jobs.findIndex(j => j.status === 'queued');
    if (index >= 0) {
      jobs[index] = { ...jobs[index], status: 'sending', claimedAt: now };
      claimed = { runId: run._id, stage: jobs[index].stage, attempt: jobs[index].attempt, ...(jobs[index].email ?? demoEmail(run.key, run.date, jobs[index].stage, jobs[index].attempt)) };
    }
    await ctx.db.patch(run._id, { jobs, workerAt: now, sender });
  }
  return claimed;
} });
export const finish = internalMutation({ args: { runId: v.id('demoRuns'), stage: demoStage, attempt: v.number(), messageId: v.optional(v.string()), error: v.optional(v.string()) }, handler: async (ctx, args) => {
  demoGate(); const run = await ctx.db.get(args.runId); if (!run) return;
  const index = run.jobs.findIndex(j => j.stage === args.stage && j.attempt === args.attempt);
  if (index < 0 || !['sending','uncertain'].includes(run.jobs[index].status)) return;
  const jobs = [...run.jobs]; jobs[index] = { ...jobs[index], status: args.messageId ? 'sent' : 'uncertain', sentAt: args.messageId ? clock.realNow() : undefined, messageId: args.messageId, error: args.error };
  await ctx.db.patch(run._id, { jobs });
} });
/** Prevent emails from past runs reaching either extractor, including after a reset race. */
export const acceptsMail = internalQuery({ args: { familyId: v.id('families'), subject: v.string() }, handler: async (ctx, { familyId, subject }) => {
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', familyId)).collect();
  if (!runs.length) return true;
  const run = runs.find(r => r.active);
  return !!run && !run.cleanupPaused && subject.startsWith(`${C.prefix} [${run.key}] `);
} });

export const noteMail = internalMutation({ args: { familyId: v.id('families'), subject: v.string(), messageId: v.string() }, handler: async (ctx, args) => {
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', args.familyId)).collect();
  if (!runs.length) return true;
  const run = runs.find(r => r.active); if (!run || run.cleanupPaused) return false;
  const index = run.jobs.findIndex(j => (j.email ?? demoEmail(run.key, run.date, j.stage, j.attempt)).subject === args.subject);
  if (index < 0) return false;
  const jobs = [...run.jobs]; jobs[index] = { ...jobs[index], receivedAt: clock.realNow(), sourceMessageId: args.messageId };
  await ctx.db.patch(run._id, { jobs }); return true;
} });

export const cleanupTargets = internalMutation({ args: { runId: v.id('demoRuns') }, handler: async (ctx, { runId }) => {
  const run = await ownedRun(ctx, runId);
  const ids = new Set(run.jobs.map(j => j.sourceMessageId).filter(Boolean));
  const plans = (await ctx.db.query('mailPlans').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect()).filter(p => ids.has(p.sourceMessageId));
  if (plans.some(p => ['running','uncertain'].includes(p.calendarOperation ?? '') || ['running','uncertain'].includes(p.draftOperation ?? ''))) fail('VALIDATION', 'Resolve the pending Google operation before cleanup.');
  for (const p of plans) await ctx.db.patch(p._id, { status: 'dismissed', revision: p.revision + 1 });
  return plans;
} });
export const cleaned = internalMutation({ args: { runId: v.id('demoRuns'), planId: v.id('mailPlans'), kind: v.union(v.literal('calendar'), v.literal('draft')), externalId: v.string() }, handler: async (ctx, args) => {
  const run = await ownedRun(ctx, args.runId); const p = await ctx.db.get(args.planId);
  if (!p || p.familyId !== run.familyId || !run.jobs.some(j => j.sourceMessageId === p.sourceMessageId)) fail('FORBIDDEN');
  if (args.kind === 'calendar' && p.calendarExternalId === args.externalId) await ctx.db.patch(p._id, { calendarExternalId: undefined, calendarOperation: undefined, status: 'dismissed', revision: p.revision + 1 });
  if (args.kind === 'draft' && p.draftId === args.externalId) await ctx.db.patch(p._id, { draftId: undefined, draftOperation: undefined, revision: p.revision + 1 });
} });
export const cleanup = action({ ...pick(API.demoConsole.cleanup), handler: async (ctx, { runId }): Promise<null> => {
  const plans: Doc<'mailPlans'>[] = await ctx.runMutation(internal.demoConsole.cleanupTargets, { runId });
  for (const p of plans) {
    for (const kind of ['calendar', 'draft'] as const) {
      const id = kind === 'calendar' ? p.calendarExternalId : p.draftId; if (!id) continue;
      const token = await accessTokenFor(ctx, p.familyId, p.ownerId);
      if (!token.ok || !await removeDemoGoogleArtifact(token.accessToken, kind, id, p._id)) fail('VALIDATION', 'Could not confirm Google cleanup. Reconnect the owner account and retry. No reset was performed.');
      await ctx.runMutation(internal.demoConsole.cleaned, { runId, planId: p._id, kind, externalId: id });
    }
  }
  return null;
} });

export const abandon = mutation({ ...pick(API.demoConsole.abandon), handler: async (ctx, { runId, stage, expectedAttempt }) => {
  const run = await ownedRun(ctx, runId); const jobs = [...run.jobs];
  const index = jobs.findIndex(j => j.stage === stage && j.attempt === expectedAttempt);
  if (index >= 0 && jobs[index].status === 'uncertain') { jobs[index] = { ...jobs[index], status: 'cancelled', error: 'Presenter closed this uncertain attempt after inspecting Gmail.' }; await ctx.db.patch(runId, { jobs }); }
  return null;
} });

/** Repair age omitted by older conversational creation, using only the admin's saved brief.
 * Deployment-only support operation; never approves connections or changes Google grants. */
export const repairAgeFromBrief = internalMutation({ args: { memberId: v.id('members') }, handler: async (ctx, { memberId }) => {
  demoGate();
  const member = await ctx.db.get(memberId);
  if (!member || member.role !== 'kid' || member.birthday || member.ageGroup) return { changed: false };
  const run = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', member.familyId)).filter(q=>q.eq(q.field('active'),true)).first();
  const brief = await ctx.db.query('assistantBriefs').withIndex('by_family_member', q=>q.eq('familyId',member.familyId).eq('memberId',memberId)).unique();
  if (!run || !brief || brief.creatorId !== run.adminId) return { changed: false };
  const ageGroup = ageGroupFromBrief(brief.proposed.context);
  if (ageGroup !== 'teen') return { changed: false };
  await ctx.db.patch(memberId,{ageGroup});
  const controls = await ctx.db.query('kidControls').withIndex('by_family_member',q=>q.eq('familyId',member.familyId).eq('memberId',memberId)).unique();
  if (controls) await ctx.db.patch(controls._id,{parentsCanReadChat:false});
  return { changed: true, ageGroup };
} });

/** Read-only delivery diagnosis, limited to an already queued email in a demo run. */
export const deliveryTarget = internalQuery({
  args: { runId: v.id('demoRuns'), stage: demoStage, attempt: v.number() },
  handler: async (ctx, args) => {
    demoGate();
    const run = await ctx.db.get(args.runId);
    const job = run?.jobs.find(j => j.stage === args.stage && j.attempt === args.attempt);
    if (!run || !job?.email) return null;
    const rows = await ctx.db.query('integrations').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
    const inbox = rows.find(i => i.kind === 'gmail' && i.label === job.email!.recipient && statusOf(i) === 'connected');
    if (!inbox?.memberId) return null;
    return { familyId: run.familyId, memberId: inbox.memberId, subject: job.email.subject, recipient: job.email.recipient };
  },
});
export const inspectDelivery = internalAction({
  args: { runId: v.id('demoRuns'), stage: demoStage, attempt: v.number() },
  handler: async (ctx, args): Promise<unknown> => {
    demoGate();
    const target = await ctx.runQuery(internal.demoConsole.deliveryTarget, args);
    if (!target) return { status: 'No matching connected demo inbox' };
    const token = await accessTokenFor(ctx, target.familyId, target.memberId);
    if (!token.ok) return { status: token.failure };
    const query = `in:anywhere subject:"${target.subject.replaceAll('"', '')}"`;
    const listed = await googleGet(withQuery(`${GMAIL.baseUrl}/messages`, { q: query, includeSpamTrash: true, maxResults: 10 }), token.accessToken);
    if (!listed.ok) return { status: listed.failure };
    const ids = (listed.json as { messages?: { id: string }[] }).messages ?? [];
    const messages = [];
    for (const { id } of ids) {
      const detail = await googleGet(withQuery(`${GMAIL.baseUrl}/messages/${encodeURIComponent(id)}`, { format: 'minimal' }), token.accessToken);
      if (detail.ok) messages.push({ id, labels: (detail.json as { labelIds?: string[] }).labelIds ?? [] });
    }
    return { recipient: target.recipient, subject: target.subject, messages };
  },
});
