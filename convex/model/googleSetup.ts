import { ageGroupOf } from '../../shared/ageGroups';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { postOwnMegaMessage } from './threads';
import { googleAvailable } from './tokenVault';
import { clock } from '../ports/clock';
import { fail } from './errors';

/** Offers the existing consent UI; never connects, grants access, or changes settings. */
export async function offerGoogleSetup(ctx: MutationCtx, member: Doc<'members'>, threadId: Id<'threads'>, now: number): Promise<string> {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.ownerId !== member._id || thread.familyId !== member.familyId) fail('FORBIDDEN');
  if (ageGroupOf(member, new Date(clock.realNow()).toISOString().slice(0,10)) === 'child') return 'Children under 13 cannot connect Google accounts. A parent can correct the age group in Family if it is wrong.';
  if (!googleAvailable()) return 'Google connections are not configured on this deployment. Do not claim that MEGA lacks Google support generally.';
  const recent = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', member.familyId).eq('threadId', threadId)).order('desc').take(8);
  if (!recent.some(m => m.body.type === 'card' && m.body.card.kind === 'connect' && m.body.card.offer === 'gmail')) {
    const id = await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'card', card: { kind: 'connect', offer: 'gmail' } }, now);
    if (!id) return 'The member needs their own MEGA before the setup card can be shown.';
  }
  return 'Google setup is available in the connection card in this chat. It opens one setup for Gmail, Calendar, optional holds/drafts and availability sharing. The person must review it and consent through Google. A teen without approval can request it from their parent there. Nothing is connected or shared by showing this card.';
}
