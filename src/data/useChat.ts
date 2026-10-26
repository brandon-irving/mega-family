// Chat screen data: the thread, sending, the streamed reply, answering a block, and reactions.
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer } from '@shared/domain/messages';
import type { Via } from '@shared/domain/enums';
import { api } from './api';

export function useChatThread() {
  return usePaginatedQuery(api.chat.thread, {}, { initialNumItems: 30 });
}

export function useSendMessage() {
  return useMutation(api.chat.send);
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
