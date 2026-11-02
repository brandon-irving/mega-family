import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { connectorAllowed } from './integrations';
import { parentOf } from './viewer';

type Ctx = QueryCtx | MutationCtx;

/** One indexed lookup shared by scheduling, cancellation, and demo cleanup. */
export const requestsForPlan = (ctx: Ctx, familyId: Id<'families'>, planId: Id<'mailPlans'>) =>
  ctx.db.query('requests').withIndex('by_family_plan', q => q.eq('familyId', familyId).eq('scheduling.planId', planId)).collect();

/** Teen consent is their own; connection approval must still belong to a registered parent. */
export async function canAnswerScheduling(ctx: Ctx, member: Doc<'members'>): Promise<boolean> {
  if (!(await connectorAllowed(ctx, member))) return false;
  if (member.role !== 'kid') return true;
  if (!member.connectionsApprovedBy) return false;
  const parent = await ctx.db.get(member.connectionsApprovedBy);
  return !!parent && parent.familyId === member.familyId && parent.role !== 'kid' &&
    (await parentOf(ctx, member.familyId, parent._id)).includes(member._id);
}
