// Shared ownership/readability check for a chat stream (CONTRACT §4 `chat.streamBody` / `chat.stream`):
// the viewer's own thread, or a kid's thread they parent with `parentsCanReadChat` on. Used by both the
// `chat.streamBody` query and `/chat-stream`'s access check (`chat.canReadStream`, convex/chat.ts) — a
// stream can't be read by probing another family's/member's stream id either way (G1 fix: the HTTP route
// used to skip this check entirely).
import type { Doc } from '../_generated/dataModel';
import type { Viewer } from '../../shared/domain/api';
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
