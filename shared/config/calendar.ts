// GD (CONTRACT v0.13): calendar layers, sharing, clashes and gift ideas. The explicit-share rule (owner,
// Oct 26; STATUS.md -> Hackathon brief) is enforced by structure: an event's layer comes only from its
// stored `scope`, and the only writes that change a private event's scope are the owner's own share
// actions (`events.share`, `shareSuggestions.answer` with share: true). Nothing here is a heuristic.
import type { Role, Scope } from '../domain/enums';

/** Which layer an event is on, derived from its `scope` (one source of truth; never stored twice).
 * - household: everyone in the family sees it (`family`), or every adult (`adults`). Hub checks these for clashes.
 * - private:   only its `ownerId` sees it (`personal`). Never read by the clash checker, gift ideas or any
 *              other member's MEGA. A `who` entry does NOT make a private event visible to that person.
 * - grant:     `shared` scope (a grant to named people). Not household: never checked for clashes. */
export const LAYER_OF_SCOPE = { family: 'household', adults: 'household', personal: 'private', shared: 'grant' } as const satisfies Record<Scope, 'household' | 'private' | 'grant'>;
export type Layer = (typeof LAYER_OF_SCOPE)[Scope];

/** The scope a shared event gets (the household layer everyone sees). */
export const SHARE_TO_SCOPE: Scope = 'family';

export const CLASH = {
  /** Two household events clash when they overlap by at least this much and need the same person. */
  minOverlapMinutes: 1,
  /** How far ahead Hub looks for clashes. */
  lookaheadDays: 14,
  /** Who approves a proposed fix (owner, Oct 27: "admin is fine"). */
  approverRole: 'admin' as Role,
  /** A proposal nobody answers expires (nothing changes) after this long, or when its first event starts. */
  expireAfterHours: 48,
  /** Fix kinds Hub may propose. One fix per clash. */
  fixKinds: ['reassign', 'move'] as const,
} as const;

export const GIFTS = {
  /** Gift ideas are offered when a member's birthday is within this many days. */
  lookaheadDays: 14,
  ideasPerSet: 3,
  /** Never shown to the person the gifts are for (it's a surprise), and never to kids. */
  viewers: ['admin', 'adult'] as readonly Role[],
  /** The only memory scopes gift ideas may cite: what's been shared with the household. Private
   * (`personal`) and grant (`shared`) memories are never read. */
  sourceScopes: ['family', 'adults'] as readonly Scope[],
} as const;
