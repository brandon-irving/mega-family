// Who can see a Scope-tagged row that isn't a memory. `events` and `lists` carry a plain `Scope` plus an
// optional owner/participant list, but no `scopeKey`/grant machinery (CONTRACT §2) — memories use the
// richer system in `model/memoryAccess.ts`. This is the simpler rule PLAN.md's scope table implies for them:
// family → everyone, adults → every non-kid, personal/shared → only the owner or someone named in it.
import type { Id } from '../_generated/dataModel';
import type { Role, Scope } from '../../shared/domain/enums';

export function canSeeScoped(
  scope: Scope,
  viewer: { memberId: Id<'members'>; role: Role },
  owned: { ownerId?: Id<'members'> | null; who?: Id<'members'>[] } = {},
): boolean {
  if (scope === 'family') return true;
  if (scope === 'adults') return viewer.role !== 'kid';
  if (owned.ownerId && owned.ownerId === viewer.memberId) return true;
  if (owned.who?.includes(viewer.memberId)) return true;
  return false;
}
