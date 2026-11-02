import { DEMO, DEMO_SCENARIO as C } from '../../shared/config/demo';
import { demoDate } from '../../shared/demoScenario';
import { beginFamily } from './familySetup';
import { requireAdmin, requireMember } from './viewer';
import { fail } from './errors';
import { clock } from '../ports/clock';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { EmailPlan } from '../../shared/domain/scheduling';
export function demoGate() { if (process.env[DEMO.envVar] !== 'true') fail('FORBIDDEN', 'Demo mode is disabled.'); }
export async function ownedRun(ctx: QueryCtx, runId: Id<'demoRuns'>) {
  demoGate(); const member = await requireMember(ctx); requireAdmin(member.role);
  const run = await ctx.db.get(runId);
  if (!run || run.familyId !== member.familyId || run.adminId !== member._id || run.ownerAuthId !== member.authId) fail('FORBIDDEN');
  return run;
}
export async function newRun(ctx: MutationCtx, familyId: Id<'families'>, adminId: Id<'members'>, authId: string) {
  const now = clock.realNow();
  return ctx.db.insert('demoRuns', { familyId, adminId, ownerAuthId: authId, key: `run-${now.toString(36)}-${adminId.slice(-6)}`, date: demoDate(now), createdAt: now, active: true, jobs: [] });
}
/** Same real onboarding path; existing families and grants are never moved between personas. */
export async function freshConsole(ctx: MutationCtx) {
  demoGate(); const current = await requireMember(ctx); requireAdmin(current.role);
  const authId = current.authId!;
  const profile = await ctx.db.query('demoProfiles').withIndex('by_authId', q => q.eq('authId', authId)).unique();
  const runs = await ctx.db.query('demoRuns').withIndex('by_owner', q => q.eq('ownerAuthId', authId)).collect();
  if (runs.some(r => r.jobs.some(j => j.status === 'sending' || j.status === 'uncertain'))) fail('VALIDATION', 'Wait for the current email delivery before restarting.');
  for (const run of runs.filter(r => r.active)) {
    const plans = await ctx.db.query('mailPlans').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
    const ids = new Set(run.jobs.map(j => j.sourceMessageId));
    if (plans.some(p => ids.has(p.sourceMessageId) && (p.calendarExternalId || p.draftId || p.calendarOperation === 'running' || p.draftOperation === 'running'))) fail('VALIDATION', 'Clean up this run’s Google artifacts before restarting.');
  }
  for (const run of runs.filter(r => r.active)) await ctx.db.patch(run._id, { active: false, jobs: run.jobs.map(j => j.status === 'queued' ? { ...j, status: 'cancelled' as const } : j) });
  await ctx.db.patch(current._id, { authId: undefined });
  if (profile) await ctx.db.patch(profile._id, { pendingInvite: undefined });
  const fresh = await beginFamily(ctx, C.timezone);
  await ctx.db.patch(fresh.familyId, { name: C.familyName });
  if (profile) await ctx.db.patch(profile._id, { demoMemberId: fresh.memberId, testedMemberIds: [], pendingInvite: undefined });
  else await ctx.db.insert('demoProfiles', { authId, originalMemberId: current._id, demoMemberId: fresh.memberId });
  await newRun(ctx, fresh.familyId, fresh.memberId, authId);
}

/** Mailbox identity wins over names. Before connection, only an unambiguous role is selected. */
export function resolveDemoPeople(members: Doc<'members'>[], integrations: Doc<'integrations'>[], adminId: Id<'members'>) {
  return C.personas.map(persona => {
    const candidates = members.filter(m => m.role === persona.role);
    const linked = candidates.filter(m => integrations.some(i => i.memberId === m._id && i.kind === 'gmail' && i.label?.toLowerCase() === persona.email));
    const member = persona.key === 'dad' ? members.find(m => m._id === adminId)
      : linked.length === 1 ? linked[0] : linked.length === 0 && candidates.length === 1 ? candidates[0] : undefined;
    return { ...persona, name: member?.name || persona.name, member, ambiguous: !member && candidates.length > 0 };
  });
}

/** Demo bookkeeping must not turn the normal extractor into a scripted-email allowlist. */
export function acceptsDemoSubject(runs: Doc<'demoRuns'>[], subject: string) {
  const active = runs.find(r => r.active);
  if (active?.cleanupPaused) return false;
  const key = subject.match(/^(?:(?:re|fwd?):\s*)*MEGA_TEST\s+\[(run-[^\]]+)\]/i)?.[1];
  return !key || active?.key === key;
}
export async function demoIngestAllowed(ctx: QueryCtx, familyId: Id<'families'>, messageId: string) {
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', familyId)).collect();
  if (runs.some(r => r.active && r.cleanupPaused)) return false;
  const tracked = runs.filter(r => r.jobs.some(j => j.sourceMessageId === messageId));
  return tracked.length === 0 || tracked.some(r => r.active && !r.cleanupPaused);
}
export async function demoRunForSource(ctx: QueryCtx, familyId: Id<'families'>, messageId: string) {
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', familyId)).collect();
  return runs.find(r => r.jobs.some(j => j.sourceMessageId === messageId))?.key;
}
/** Rehearsal-only idempotency and legacy confirmation routing, isolated from scheduling rules. */
export async function demoPlanContext(ctx: QueryCtx, integration: Doc<'integrations'>, source: { messageId: string; threadId: string }, first?: EmailPlan) {
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', integration.familyId)).collect();
  const run = runs.find(r => r.active && r.jobs.some(j => j.sourceMessageId === source.messageId));
  const job = run?.jobs.find(j => j.sourceMessageId === source.messageId);
  const stage = job?.stage;
  if (run && stage && stage !== 'confirmation' && integration.memberId) {
    const sources = new Set(run.jobs.filter(j => j.stage === stage).map(j => j.sourceMessageId));
    const existing = await ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', integration.familyId).eq('ownerId', integration.memberId!)).collect();
    if (existing.some(p => p.integrationId === integration._id && (sources.has(p.sourceMessageId) || (stage === 'publicity' && run.jobs.some(j => j.stage === 'confirmation' && j.planId === p._id))) && p.threadId !== source.threadId && !['dismissed', 'cancelled'].includes(p.status))) return { reject: true, linked: null };
  }
  const linked = stage === 'confirmation' && job?.planId ? await ctx.db.get(job.planId) : null;
  if (stage === 'confirmation' && (!linked || linked.integrationId !== integration._id || linked.ownerId !== integration.memberId || linked.familyId !== integration.familyId || linked.revision !== job?.planRevision || linked.replyOperation !== 'done' || linked.status !== 'held')) return { reject: true, linked: null };
  if (linked && (!first || first.intent !== 'confirmed' || first.slots.length !== 1 || first.slots[0].start !== linked.selected?.start || first.slots[0].end !== linked.selected?.end)) return { reject: true, linked: null };
  return { reject: false, linked };
}
export async function demoPeople(ctx: QueryCtx, run: Pick<Doc<'demoRuns'>, 'familyId' | 'adminId'>) {
  const members = await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  const integrations = await ctx.db.query('integrations').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  return resolveDemoPeople(members, integrations, run.adminId);
}

/** Shared by preview/readiness and queue validation so their requirements cannot drift. */
export function demoAccountIssue(name: string, expectedEmail: string, connectedEmail: string | undefined, recognition: boolean): string | undefined {
  if (!connectedEmail) return `Connect ${expectedEmail} for ${name} in Demo accounts.`;
  if (connectedEmail.trim().toLowerCase() !== expectedEmail) return `${name} is connected to ${connectedEmail}, but this demo uses ${expectedEmail}. Reconnect ${name} in Demo accounts and choose ${expectedEmail}.`;
  if (!recognition) return `${name}’s Gmail is connected. Turn on email recognition in ${name}’s Google setup; no new Google connection is needed.`;
  return undefined;
}

/** Ordinary Google setup must honor the same persona binding as centralized demo setup. */
export async function expectedDemoEmail(ctx: QueryCtx, member: Doc<'members'>): Promise<string | undefined> {
  if (process.env[DEMO.envVar] !== 'true') return undefined;
  const run = (await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', member.familyId)).collect()).find(r => r.active);
  if (!run) return undefined;
  return (await demoPeople(ctx, run)).find(p => p.member?._id === member._id)?.email;
}
