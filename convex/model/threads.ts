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

/** G5: posts one message from the member's own MEGA in their own thread (onboarding lines and blocks, "found
 * nothing", "disconnected"). `at` is nudged past the thread's last message so several posts in one mutation keep
 * their order. Null when the member has no MEGA. `ruleBlock` marks a block answered by rule (v0.17b, C3). */
export async function postOwnMegaMessage(
  ctx: MutationCtx,
  familyId: Id<'families'>,
  memberId: Id<'members'>,
  body: Doc<'messages'>['body'],
  now: number,
  extra: { ruleBlock?: Doc<'messages'>['ruleBlock'] } = {},
): Promise<Id<'messages'> | null> {
  const mega = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId))
    .unique();
  if (!mega) return null;
  const thread = await getOrCreateOwnThread(ctx, familyId, memberId, mega._id, now);
  const at = Math.max(now, thread.lastAt + 1);
  const id = await ctx.db.insert('messages', { familyId, threadId: thread._id, at, author: { kind: 'mega', id: mega._id }, via: 'text', body, chips: [], ...(extra.ruleBlock ? { ruleBlock: extra.ruleBlock } : {}) });
  await ctx.db.patch(thread._id, { lastAt: at });
  return id;
}
