// CONTRACT §4 `megas.status`: "Busy" unless shared per `sharing.hqActivity`. Used both by `megas.status`
// itself and by `family.members`' per-member status badge, so the rule lives in one place.
import type { Doc, Id } from '../_generated/dataModel';
import type { ShareLevel } from '../../shared/domain/enums';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canSeeShared } from './sharingAccess';

export async function megaStatusFor(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<'families'>,
  viewerId: Id<'members'>,
  ownerId: Id<'members'> | undefined,
  mega: Doc<'megas'>,
  hqActivityLevel: ShareLevel | undefined,
): Promise<{ station: Doc<'megas'>['job']['station']; label: string; busy: boolean }> {
  // The family (coordinator) MEGA has no owner to gate on, so it's always visible.
  if (!ownerId) return { station: mega.job.station, label: mega.job.label, busy: mega.job.busy };
  const visible = await canSeeShared(ctx, familyId, viewerId, ownerId, hqActivityLevel ?? 'family');
  if (visible) return { station: mega.job.station, label: mega.job.label, busy: mega.job.busy };
  return { station: 'charger', label: 'Busy', busy: true }; // hides both the activity and the station it implies
}
