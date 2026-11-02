import { inviteTokenFrom } from '../../shared/inviteToken';
import { sha256Hex } from './random';
import type { QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';

/** `token` may be the bare code or the full join link (a scanned QR or a pasted link). */
export async function inviteByToken(ctx: QueryCtx, token: string): Promise<Doc<'invites'> | null> {
  const hash = await sha256Hex(inviteTokenFrom(token));
  return ctx.db
    .query('invites')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hash))
    .unique();
}
