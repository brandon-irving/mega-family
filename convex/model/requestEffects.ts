// Real effects for answering a MEGA-to-MEGA request (PLAN.md -> Proactive engine step 6: "Yes -> tell
// Coral and add milk to Groceries"). Called by both `requests.respond` (the chat card's Yes/No buttons) and
// `notifications.answer` (the same request's push/lock-screen buttons) — CONTRACT §5: "An answer from the
// lock screen and one in the chat are recorded the same way."
import { dispatchTool } from '../agent/tools';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { getOrCreateOwnThread } from './threads';

/** Idempotent: a request already answered (`status !== 'open'`) is a no-op that just returns the same kind
 * of summary again, never re-applies `onAccept`'s effect twice — the one thing that matters for "the
 * backend side must accept answers idempotently" (an app killed mid-flight, or the same request answered
 * once from the lock screen and again from the thread card). */
export async function respondToRequest(ctx: MutationCtx, params: { requestId: Id<'requests'>; accept: boolean; now: number }): Promise<string> {
  const request = await ctx.db.get(params.requestId);
  if (!request) return 'That request no longer exists.';
  if (request.status !== 'open') {
    return request.status === 'accepted' ? 'Already said yes to this.' : request.status === 'declined' ? "Already said you can't." : 'Already handled.';
  }

  await ctx.db.patch(request._id, { status: params.accept ? 'accepted' : 'declined' });

  const fromMember = await ctx.db.get(request.fromMemberId);
  const toMember = await ctx.db.get(request.toMemberId);
  const toMega = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', request.familyId).eq('ownerId', request.toMemberId))
    .unique();

  // "tell Coral" — a message in the requester's own thread, from the answering member's MEGA.
  if (fromMember) {
    const requesterThread = await getOrCreateOwnThread(ctx, request.familyId, request.fromMemberId, toMega?._id ?? null, params.now);
    const replyText = params.accept ? `${toMember?.name ?? 'They'} said yes: "${request.text}"` : `${toMember?.name ?? 'They'} can't right now: "${request.text}"`;
    await ctx.db.insert('messages', {
      familyId: request.familyId,
      threadId: requesterThread._id,
      at: params.now,
      author: toMega ? { kind: 'mega', id: toMega._id } : { kind: 'system' },
      via: 'text',
      body: { type: 'text', text: replyText },
      chips: [],
    });
    await ctx.db.patch(requesterThread._id, { lastAt: params.now });
  }

  // "add milk to Groceries" — the declared onAccept effect, run through the SAME tool handler a chat
  // `ask_member` call's follow-up would use (convex/agent/tools.ts `dispatchTool`), as the ACCEPTING
  // member (they're the one actually doing it).
  if (params.accept && request.onAccept?.tool === 'lists_add') {
    const toThread = await getOrCreateOwnThread(ctx, request.familyId, request.toMemberId, toMega?._id ?? null, params.now);
    await dispatchTool(ctx, {
      familyId: request.familyId,
      memberId: request.toMemberId,
      megaId: toMega?._id,
      threadId: toThread._id,
      name: 'lists_add',
      argumentsJson: JSON.stringify({ listName: request.onAccept.listName, text: request.onAccept.text }),
    });
  }

  return params.accept ? `Told ${fromMember?.name ?? 'them'} you'll handle it.` : `Told ${fromMember?.name ?? 'them'} you can't right now.`;
}
