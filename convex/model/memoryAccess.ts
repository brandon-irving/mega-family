// Memory scope enforcement (PLAN.md → Global memory: "enforced in queries, never only in prompts").
// `readableScopeKeys` is the one function every memory read goes through; there is no other read path.
import type { Doc, Id } from '../_generated/dataModel';
import type { Role } from '../../shared/domain/enums';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { scopeKey } from './scopes';

type Ctx = QueryCtx | MutationCtx;

/** The scope keys a member (or their MEGA) may read: family, their own personal key, adults (unless a kid),
 * and every `shared` grant they own or are a grantee of. */
export async function readableScopeKeys(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>, role: Role): Promise<string[]> {
  const keys = [scopeKey(familyId, { scope: 'family' }), scopeKey(familyId, { scope: 'personal', memberId })];
  if (role !== 'kid') keys.push(scopeKey(familyId, { scope: 'adults' }));
  const grants = await ctx.db
    .query('grants')
    .withIndex('by_family_owner', (q) => q.eq('familyId', familyId))
    .collect();
  for (const g of grants) if (g.ownerId === memberId || g.granteeIds.includes(memberId)) keys.push(scopeKey(familyId, { scope: 'shared', grantId: g._id }));
  return keys;
}

/** The grant a `shared`-scope memory's key points at, or null if the key doesn't parse as one. */
export async function grantForScopeKey(ctx: Ctx, key: string): Promise<Doc<'grants'> | null> {
  const grantId = key.split(':')[2] as Id<'grants'> | undefined;
  if (!grantId) return null;
  const grant = await ctx.db.get(grantId);
  return grant ?? null;
}

/** Whether `viewer` may forget or reassign the scope of `memory` (CONTRACT §4 `memories.forget` /
 * `.changeScope`): the memory's owner, or an admin — except `family`-scope memories, which have no single
 * owner, so only an admin may touch them. Documented product decision (not spelled out in CONTRACT). */
export async function canModifyMemory(
  ctx: Ctx,
  memory: Doc<'memories'>,
  viewer: { familyId: Id<'families'>; memberId: Id<'members'>; role: Role },
): Promise<boolean> {
  if (viewer.role === 'admin') return true;
  switch (memory.scope) {
    case 'family':
      return false;
    case 'adults':
      return viewer.role !== 'kid';
    case 'personal':
      return memory.scopeKey === scopeKey(viewer.familyId, { scope: 'personal', memberId: viewer.memberId });
    case 'shared': {
      const grant = await grantForScopeKey(ctx, memory.scopeKey);
      return grant?.ownerId === viewer.memberId;
    }
  }
}
