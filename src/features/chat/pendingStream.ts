// Which MEGA reply is still being written, so the chat screen's streaming line can follow it. Every way a
// MEGA starts writing (chat.send, chat.answerBlock, a kid's "Show me", the MEGA's own starter from
// chat.start) inserts an empty text message with a `streamId` and fills it when done.
import type { MessageDoc } from './MessageList';

/** A MEGA text message that has a stream but no text yet. */
export function isMegaStillWriting(message: MessageDoc): boolean {
  return message.author.kind === 'mega' && message.body.type === 'text' && !message.body.text && !!message.streamId;
}

/** The stream id of the newest message (pages are newest-first), when it's a MEGA reply still being written. */
export function pendingMegaStreamId(messages: readonly MessageDoc[]): string | null {
  const newestMega = messages.find((m) => m.author.kind === 'mega');
  return newestMega && isMegaStillWriting(newestMega) ? (newestMega.streamId ?? null) : null;
}
