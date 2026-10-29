// Function references the G5 review fixes need that the contract (shared/domain/api.ts) doesn't list yet: the
// backend fix agent adds them as CONTRACT v0.17b. Until they land, every read goes through `useQueryState`,
// whose missing-function error becomes a calm fallback (the feature just doesn't show), never a crash; and no
// mutation here is offered unless its query proved the backend has it. When v0.17b merges, move each into
// `api.*` (src/data/api.ts builds them from the contract) and delete this file.
import { makeFunctionReference } from 'convex/server';
import type { Id } from '@shared/domain/validators';
import type { KidControls } from '@/features/settings/RulesContent';

/** Who decided an Activity item (CONTRACT `decidedBy` strings: `rule:<id>`, `model:<id>`, or a member). */
export type DecidedBy = string;

/** `invites.forMember({ memberId })`: the member's newest unexpired, unused invite, or null. The link can't
 * be shown again (the server keeps only a hash), so it's the expiry alone. Parents and the admin. */
export const invitesForMember = makeFunctionReference<'query', { memberId: Id<'members'> }, { expiresAt: number } | null>('invites:forMember');

/** A kid's own rules, read-only (board ProfileRulesKid): their kid controls, who their parents are, whether
 * those parents can read the kid's chats, and (once parents can set it) the daily buzz cap. */
export type MyRules = {
  controls: KidControls;
  parents: string[];
  parentsCanReadChat: boolean;
  notifyDailyCap?: number;
};
export const kidControlsMine = makeFunctionReference<'query', Record<string, never>, MyRules | null>('kidControls:mine');

/** A kid's daily buzz cap as their parent sees it (board ProfileRules "Buzzes a day"), and the parent's setter. */
export const kidNotifyCap = makeFunctionReference<'query', { memberId: Id<'members'> }, { dailyCap: number; min: number; max: number } | null>('kidControls:notifyCap');
export const setKidNotifyCap = makeFunctionReference<'mutation', { memberId: Id<'members'>; dailyCap: number }, null>('kidControls:setNotifyCap');
