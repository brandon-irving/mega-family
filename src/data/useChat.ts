// Chat screen data: the thread, sending, the streamed reply, answering a block, and reactions.
import { useEffect, useRef } from 'react';
import { insertAtTop, useMutation, usePaginatedQuery } from 'convex/react';
import type { Infer } from 'convex/values';
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer } from '@shared/domain/messages';
import type { Via } from '@shared/domain/enums';
import type { messageDoc, viewer as viewerValidator } from '@shared/domain/api';
import { api } from './api';
import { useQuery } from './useQuery';
import { useStablePaginatedQuery } from './useStableQuery';
import { useViewer } from './useViewer';

/** CONTRACT v0.13b `chat.start` (owner, Oct 28: MEGAs start the conversation): asks once per chat-screen
 * mount, as soon as the viewer and the first page are in; the server writes the MEGA's starter at most
 * once per thread, so asking again on a later visit is a cheap no-op. */
export function useStartChat(ready: boolean) {
  const start = useMutation(api.chat.start);
  const asked = useRef(false);
  useEffect(() => {
    if (!ready || asked.current) return;
    asked.current = true;
    start({}).catch(() => {
      asked.current = false; // a later render (e.g. back online) tries again
    });
  }, [ready, start]);
}

export function useChatThread() {
  return useStablePaginatedQuery(usePaginatedQuery(api.chat.thread, {}, { initialNumItems: 30 }));
}

type Viewer = Infer<typeof viewerValidator>;
type MessageDoc = Infer<typeof messageDoc>;
type SendArgs = { text: string; mentions?: Id<'megas'>[]; via: Via };

/** A plain (non-hook, non-component) function on purpose: React Compiler's purity rule forbids
 * `Date.now()`/`Math.random()` inside a component/hook body (even in a nested callback), since it can't
 * prove the callback never runs during render — moving the actual impure work into an ordinary helper
 * outside that scope is the documented way out, and it's independently unit-testable besides. */
export function buildOptimisticMessage(viewer: Viewer, args: SendArgs): MessageDoc {
  const now = Date.now();
  return {
    _id: `optimistic:${now}:${Math.random().toString(36).slice(2)}` as Id<'messages'>,
    _creationTime: now,
    familyId: viewer.family._id,
    threadId: 'optimistic' as Id<'threads'>, // never read: swapped out once the real row arrives
    at: now,
    author: { kind: 'member', id: viewer.member._id },
    via: args.via,
    body: { type: 'text', text: args.text, mentions: args.mentions },
    chips: [],
  };
}

/** No-flicker rule: the viewer's own message appears the instant they hit send, in the same row it'll
 * occupy once the server confirms it (same shape as `chat.thread`'s `messageDoc`, Convex's optimistic
 * update swaps the temporary row for the real one when the authoritative result lands — no second pop-in,
 * no layout jump) rather than waiting on a round trip to show anything. */
export function useSendMessage() {
  const viewer = useViewer();
  return useMutation(api.chat.send).withOptimisticUpdate((localStore, args) => {
    if (!viewer) return;
    insertAtTop({ paginatedQuery: api.chat.thread, localQueryStore: localStore, item: buildOptimisticMessage(viewer, args) });
  });
}

/** Polls/subscribes the streamed reply text for a messageId's streamId (persistent-text-streaming wiring lands later). */
export function useStreamBody(streamId: string | null) {
  return useQuery(api.chat.streamBody, streamId ? { streamId } : 'skip');
}

export function useAnswerBlock() {
  const answer = useMutation(api.chat.answerBlock);
  return (messageId: Id<'messages'>, blockAnswer: BlockAnswer, via: Via) => answer({ messageId, answer: blockAnswer, via });
}

export function useReactToMessage() {
  return useMutation(api.chat.react);
}
