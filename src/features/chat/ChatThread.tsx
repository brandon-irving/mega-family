// The scrollable thread: messages, reply buttons on blocks, result cards. Presentational — takes
// already-loaded messages (newest first, as chat.thread's pagination returns them, CONTRACT §4) and
// callbacks, so it can be driven by usePaginatedQuery in the route or by fixtures in tests. Just wires
// ChatThread's own callbacks into the shared MessageList renderer (see its docstring for *why* it's an
// inverted FlatList) — "mine" here means the signed-in viewer's own authored messages.
import { useCallback } from 'react';
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer, SaveChip } from '@shared/domain/messages';
import type { Reaction, Role, Scope } from '@shared/domain/enums';
import type { MegaInfo } from '@/features/shell/megaInfo';
import type { NotificationDoc } from '@/data/useNotifications';
import { MessageList, type MessageDoc } from './MessageList';

export type ChatThreadProps = {
  messages: MessageDoc[];
  viewerMemberId: Id<'members'>;
  /** Kids' save chips are read-only (PLAN "MEGA profile") — defaults to 'adult' so existing callers/tests
   * that don't care about this still render the normal, interactive chip. */
  viewerRole?: Role;
  megaById: Record<string, MegaInfo>;
  onLoadMore?: () => void;
  onAnswerBlock: (messageId: Id<'messages'>, answer: BlockAnswer) => void;
  onReact: (messageId: Id<'messages'>, reaction: Reaction | null) => void;
  onChangeMemoryScope: (memoryId: Id<'memories'>, scope: Scope) => void;
  onForgetMemory: (memoryId: Id<'memories'>) => void;
  onRespondRequest?: (requestId: string, accept: boolean) => void;
  onAnswerNotification?: (notificationId: string, buttonId: string) => void;
  notificationsById?: Record<string, NotificationDoc>;
  /** CONTRACT §6: a deep-link tap scrolls the thread to this message and briefly highlights it. */
  scrollToMessageId?: Id<'messages'>;
  /** G3 review fix (BLOCKER, deep link to an older message): true once pagination has no more pages —
   * see MessageList.tsx's `paginationExhausted` for why this is distinct from `onLoadMore` being
   * momentarily undefined between pages. */
  paginationExhausted?: boolean;
};

export function ChatThread({
  messages,
  viewerMemberId,
  viewerRole = 'adult',
  megaById,
  onLoadMore,
  onAnswerBlock,
  onReact,
  onChangeMemoryScope,
  onForgetMemory,
  onRespondRequest,
  onAnswerNotification,
  notificationsById,
  scrollToMessageId,
  paginationExhausted,
}: ChatThreadProps) {
  // G2 fix item 4: a stable identity (not a fresh closure every render) so MessageList's own renderItem
  // useCallback deps don't change on every ChatThread re-render — see MessageList.tsx's docstring.
  const isMine = useCallback((m: MessageDoc) => m.author.kind === 'member' && m.author.id === viewerMemberId, [viewerMemberId]);
  return (
    <MessageList
      messages={messages}
      isMine={isMine}
      megaById={megaById}
      onLoadMore={onLoadMore}
      onAnswerBlock={onAnswerBlock}
      onReact={onReact}
      onChangeMemoryScope={onChangeMemoryScope}
      onForgetMemory={onForgetMemory}
      onRespondRequest={onRespondRequest}
      onAnswerNotification={onAnswerNotification}
      notificationsById={notificationsById}
      chipsReadOnly={viewerRole === 'kid'}
      emptyLabel="No messages yet. Say hello."
      scrollToMessageId={scrollToMessageId}
      paginationExhausted={paginationExhausted}
    />
  );
}

export type { MessageDoc, SaveChip };
