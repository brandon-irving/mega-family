import { DEMO, DEMO_SCENARIO as C } from '../../shared/config/demo';
import { demoDate } from '../../shared/demoScenario';
import { beginFamily } from './familySetup';
import { requireAdmin, requireMember } from './viewer';
import { fail } from './errors';
import { clock } from '../ports/clock';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
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
    return { ...persona, name: member?.name || persona.name, member };
  });
}
export async function demoPeople(ctx: QueryCtx, run: Pick<Doc<'demoRuns'>, 'familyId' | 'adminId'>) {
  const members = await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  const integrations = await ctx.db.query('integrations').withIndex('by_family', q => q.eq('familyId', run.familyId)).collect();
  return resolveDemoPeople(members, integrations, run.adminId);
}
