import { INVITE_MEGA_DEFAULTS } from '../../shared/config/looks';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { fail } from './errors';
/** Owner-only naming shared by profile editing and conversation tools. */
export async function renameOwnMega(ctx: MutationCtx, member: Doc<'members'>, value: unknown) {
  if (member.role === 'kid') fail('FORBIDDEN', 'A parent chooses this MEGA’s name.');
  if (typeof value !== 'string' || !value.trim() || value.trim().length > INVITE_MEGA_DEFAULTS.maxNameLength) fail('VALIDATION', 'MEGA name');
  const mega = await ctx.db.query('megas').withIndex('by_family_owner', q => q.eq('familyId', member.familyId).eq('ownerId', member._id)).unique();
  if (!mega) fail('NOT_FOUND');
  await ctx.db.patch(mega._id, { name: value.trim() });
  return value.trim();
}
