// Shared "find or create a member's own thread" logic (CONTRACT §2 `threads`: "one private thread per
// member"). `chat.send` inlines this for itself; the agent's `ask_member` tool (convex/agent/tools.ts)
// reuses it to deliver a card into the *other* member's thread without duplicating the lookup/insert.
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export async function getOrCreateOwnThread(
  ctx: MutationCtx,
  familyId: Id<'families'>,
  ownerId: Id<'members'>,
  defaultMegaId: Id<'megas'> | null,
  now: number,
): Promise<Doc<'threads'>> {
  const existing = await ctx.db
    .query('threads')
    .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', ownerId))
    .unique();
  if (existing) return existing;
  const threadId = await ctx.db.insert('threads', { familyId, ownerId, megaIds: defaultMegaId ? [defaultMegaId] : [], lastAt: now });
  return (await ctx.db.get(threadId))!;
}
