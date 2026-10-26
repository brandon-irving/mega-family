// Shared ownership/readability check for a chat stream (CONTRACT §4 `chat.streamBody` / `chat.stream`):
// the viewer's own thread, or a kid's thread they parent with `parentsCanReadChat` on. Used by both the
// `chat.streamBody` query and `/chat-stream`'s access check (`chat.canReadStream`, convex/chat.ts) — a
// stream can't be read by probing another family's/member's stream id either way (G1 fix: the HTTP route
// used to skip this check entirely).
import type { Doc } from '../_generated/dataModel';
import type { Viewer } from '../../shared/domain/api';
import type { BlockAnswer, UIBlock } from '../../shared/domain/messages';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';

type Ctx = QueryCtx | MutationCtx;

export async function requireReadableStream(ctx: Ctx, viewer: Viewer, streamId: string): Promise<Doc<'messages'>> {
  const message = await ctx.db
    .query('messages')
    .withIndex('by_streamId', (q) => q.eq('streamId', streamId))
    .unique();
  if (!message || message.familyId !== viewer.member.familyId) fail('NOT_FOUND');
  const thread = await ctx.db.get(message.threadId);
  if (!thread) fail('NOT_FOUND');
  if (thread.ownerId === viewer.member._id) return message;
  if (viewer.isParentOf.includes(thread.ownerId)) {
    const controls = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', thread.ownerId))
      .unique();
    if (controls?.parentsCanReadChat) return message;
  }
  fail('FORBIDDEN');
}

/** Turns a block + its answer into plain text, so `chat.answerBlock` can feed the answer back into the
 * agent loop as an ordinary user turn (task brief: "chat.answerBlock should feed the answer back into the
 * loop") — the loop sees the same block/answer in its recent-thread context either way. */
export function describeBlockAnswer(block: UIBlock, answer: BlockAnswer): string {
  // `invite`/`look`/`questions` blocks have no `prompt` field; the agent loop never emits them (convex/
  // agent/tools.ts `validateUiBlock`) but the shared `UIBlock` union still includes them.
  const prompt = 'prompt' in block ? block.prompt : block.kind;
  if (answer.skipped) return `(skipped: "${prompt}")`;
  if (answer.optionIds?.length && block.kind === 'choice') {
    const labels = answer.optionIds.map((id) => block.options.find((o) => o.id === id)?.label ?? id);
    const other = answer.other ? [...labels, answer.other] : labels;
    return `Answered "${prompt}": ${other.join(', ')}`;
  }
  if (answer.fields) return `Answered "${prompt}": ${Object.entries(answer.fields).map(([k, v]) => `${k}=${v}`).join(', ')}`;
  if (answer.value !== undefined) return `Answered "${prompt}": ${answer.value}`;
  return `Answered "${prompt}".`;
}
