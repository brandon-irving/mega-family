// Memory scope keys. One string per scope so Convex search can filter on it with a single equality
// (search filters don't support AND across fields). The format is part of the contract.
import type { Id } from '../_generated/dataModel';
import type { Scope } from '../../shared/domain/enums';

export type ScopeTarget =
  | { scope: 'family' }
  | { scope: 'adults' }
  | { scope: 'personal'; memberId: Id<'members'> }
  | { scope: 'shared'; grantId: Id<'grants'> };

export function scopeKey(familyId: Id<'families'>, target: ScopeTarget): string {
  switch (target.scope) {
    case 'family':
      return `${familyId}:family`;
    case 'adults':
      return `${familyId}:adults`;
    case 'personal':
      return `${familyId}:personal:${target.memberId}`;
    case 'shared':
      return `${familyId}:shared:${target.grantId}`;
  }
}

/** The scope a key belongs to, or null if the key isn't for this family. */
export function parseScopeKey(familyId: Id<'families'>, key: string): Scope | null {
  const [fam, scope] = key.split(':');
  if (fam !== familyId) return null;
  return scope === 'family' || scope === 'adults' || scope === 'personal' || scope === 'shared' ? scope : null;
}
