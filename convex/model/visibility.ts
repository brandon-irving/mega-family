// Who can see a Scope-tagged row that isn't a memory. `events` and `lists` carry a plain `Scope` plus an
// optional owner/participant list, but no `scopeKey`/grant machinery (CONTRACT §2) — memories use the
// richer system in `model/memoryAccess.ts`. This is the simpler rule PLAN.md's scope table implies for them:
// family → everyone, adults → every non-kid, personal/shared → only the owner or someone named in it.
//
// GD (CONTRACT v0.13 tightening, owner's explicit-share rule): events use `canSeeEvent` instead — a
// `personal` event is on its owner's private layer and nobody else sees it, not even people in its `who`.
import { LAYER_OF_SCOPE, type Layer } from '../../shared/config/calendar';
import type { Role, Scope } from '../../shared/domain/enums';
import type { Doc, Id } from '../_generated/dataModel';

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

/** The owner of an event's private layer: `ownerId`, else (rows from before v0.13) `createdBy`. */
export function eventOwnerId(event: Pick<Doc<'events'>, 'ownerId' | 'createdBy'>): Id<'members'> | undefined {
  return event.ownerId ?? event.createdBy;
}

export function layerOf(event: Pick<Doc<'events'>, 'scope'>): Layer {
  return LAYER_OF_SCOPE[event.scope];
}

/** GD invariant 2 (private is invisible): household events follow their scope; a private (`personal`)
 * event is visible ONLY to its owner, whoever is in its `who`; a grant (`shared`) event to its owner and the
 * people named in it. */
export function canSeeEvent(viewer: { memberId: Id<'members'>; role: Role }, event: Pick<Doc<'events'>, 'scope' | 'ownerId' | 'createdBy' | 'who'>): boolean {
  switch (layerOf(event)) {
    case 'household':
      return canSeeScoped(event.scope, viewer);
    case 'private':
      return eventOwnerId(event) === viewer.memberId;
    case 'grant':
      return eventOwnerId(event) === viewer.memberId || event.who.includes(viewer.memberId);
  }
}
