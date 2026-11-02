import { availabilitySharingMode } from '../../shared/scheduling';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { connectorAllowed } from './integrations';

/** Family is an explicit ongoing availability grant, evaluated against current membership/approval. */
export async function sharesAvailability(ctx: QueryCtx, preference: Doc<'schedulingPreferences'> | null, recipientId: Id<'members'>): Promise<boolean> {
  if (!preference || preference.memberId === recipientId) return false;
  const mode = availabilitySharingMode(preference);
  if (mode === 'private' || (mode === 'custom' && !preference.availabilityFor.includes(recipientId))) return false;
  const [owner, recipient] = await Promise.all([ctx.db.get(preference.memberId), ctx.db.get(recipientId)]);
  if (!owner || !recipient || owner.familyId !== preference.familyId || recipient.familyId !== preference.familyId) return false;
  return await connectorAllowed(ctx, owner) && await connectorAllowed(ctx, recipient);
}
