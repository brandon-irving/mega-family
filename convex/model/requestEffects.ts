// Real effects for answering a MEGA-to-MEGA request (PLAN.md -> Proactive engine step 6: "Yes -> tell
// Coral and add milk to Groceries"). Called by both `requests.respond` (the chat card's Yes/No buttons) and
// `notifications.answer` (the same request's push/lock-screen buttons) — CONTRACT §5: "An answer from the
// lock screen and one in the chat are recorded the same way."
import { answerSchedulingRequest } from './schedulingCoordination';
import { dispatchTool } from '../agent/tools';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { getOrCreateOwnThread } from './threads';
import { canAnswerScheduling } from './schedulingRequests';
import { fail } from './errors';
import { COORDINATION_COPY } from '../../shared/config/scheduling';

/** Idempotent: a request already answered (`status !== 'open'`) is a no-op that just returns the same kind
 * of summary again, never re-applies `onAccept`'s effect twice — the one thing that matters for "the
 * backend side must accept answers idempotently" (an app killed mid-flight, or the same request answered
 * once from the lock screen and again from the thread card). */
export async function respondToRequest(ctx: MutationCtx, params: { requestId: Id<'requests'>; accept: boolean; now: number }): Promise<string> {
  const request = await ctx.db.get(params.requestId);
  if (!request) return 'That request no longer exists.';
  const recipient = await ctx.db.get(request.toMemberId);
  if (!recipient || recipient.familyId !== request.familyId || (recipient.role === 'kid' && (!request.scheduling || !await canAnswerScheduling(ctx, recipient)))) fail('FORBIDDEN', COORDINATION_COPY.approvalRequired);
  if (request.status !== 'open') {
    return request.status === 'accepted' ? 'Already said yes to this.' : request.status === 'declined' ? "Already said you can't." : 'Already handled.';
  }

  if (request.scheduling) return answerSchedulingRequest(ctx, request, params.accept, params.now);

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
  let autoEffectFailed = false;
  if (params.accept && request.onAccept?.tool === 'lists_add') {
    const toThread = await getOrCreateOwnThread(ctx, request.familyId, request.toMemberId, toMega?._id ?? null, params.now);
    // C5 (MEDIUM, G3 correctness review): this used to fire-and-forget `dispatchTool`'s result — a failure
    // (a malformed `onAccept.listName`, a future tool that starts validating harder) silently told the
    // accepting member "you'll handle it" while never actually adding anything. Check `ok` and reflect a
    // failure in both the reply AND a logged record, instead of a silent no-op.
    const toolResult = await dispatchTool(ctx, {
      familyId: request.familyId,
      memberId: request.toMemberId,
      megaId: toMega?._id,
      threadId: toThread._id,
      name: 'lists_add',
      argumentsJson: JSON.stringify({ listName: request.onAccept.listName, text: request.onAccept.text }),
    });
    if (!toolResult.ok) {
      autoEffectFailed = true;
      await ctx.db.insert('familyEvents', {
        familyId: request.familyId,
        at: params.now,
        type: 'said',
        payload: { requestOnAcceptFailed: { requestId: request._id, tool: request.onAccept.tool, reason: toolResult.resultText } },
        processed: { memory: true, profiler: true, triggers: true },
      });
    }
  }

  if (!params.accept) return `Told ${fromMember?.name ?? 'them'} you can't right now.`;
  return autoEffectFailed
    ? `Told ${fromMember?.name ?? 'them'} you'll handle it, but couldn't do it automatically — you'll need to do it yourself.`
    : `Told ${fromMember?.name ?? 'them'} you'll handle it.`;
}
