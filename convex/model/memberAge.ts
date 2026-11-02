import { ageGroupAt } from '../../shared/ageGroups';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { clock } from '../ports/clock';

/** Birthday boundaries follow the household's local day and are never advanced by the demo clock. */
export async function memberAgeGroup(ctx: QueryCtx, member: Pick<Doc<'members'>, 'familyId' | 'role' | 'birthday' | 'ageGroup'>) {
  const family = await ctx.db.get(member.familyId);
  return ageGroupAt(member, clock.realNow(), family?.timezone);
}
