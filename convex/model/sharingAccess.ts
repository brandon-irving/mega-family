// "What it shares" (PLAN.md → 3. MEGA profile; CONTRACT `sharing` table / `sharing.set`). A member's
// schedule, lists and HQ activity are each visible to `me` (only the owner) · `partner` · `family`.
import type { Id } from '../_generated/dataModel';
import type { ShareLevel } from '../../shared/domain/enums';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export async function canSeeShared(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<'families'>,
  viewerId: Id<'members'>,
  ownerId: Id<'members'>,
  level: ShareLevel,
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  if (level === 'family') return true;
  if (level === 'me') return false;
  const rels = await ctx.db
    .query('relationships')
    .withIndex('by_family_from', (q) => q.eq('familyId', familyId).eq('from', ownerId))
    .collect();
  return rels.some((r) => r.to === viewerId && r.kind === 'partner');
}
