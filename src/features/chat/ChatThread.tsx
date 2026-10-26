// The scrollable thread: messages, reply buttons on blocks, result cards. Presentational — takes
// already-loaded messages (newest first, as chat.thread's pagination returns them, CONTRACT §4) and
// callbacks, so it can be driven by usePaginatedQuery in the route or by fixtures in tests. Just wires
// ChatThread's own callbacks into the shared MessageList renderer (see its docstring for *why* it's an
// inverted FlatList) — "mine" here means the signed-in viewer's own authored messages.
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer, SaveChip } from '@shared/domain/messages';
import type { Reaction, Scope } from '@shared/domain/enums';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { MessageList, type MessageDoc } from './MessageList';

export type ChatThreadProps = {
  messages: MessageDoc[];
  viewerMemberId: Id<'members'>;
  megaById: Record<string, MegaInfo>;
  onLoadMore?: () => void;
  onAnswerBlock: (messageId: Id<'messages'>, answer: BlockAnswer) => void;
  onReact: (messageId: Id<'messages'>, reaction: Reaction | null) => void;
  onChangeMemoryScope: (memoryId: Id<'memories'>, scope: Scope) => void;
  onForgetMemory: (memoryId: Id<'memories'>) => void;
  onRespondRequest?: (requestId: string, accept: boolean) => void;
  onAnswerNotification?: (notificationId: string, buttonId: string) => void;
  notificationButtonsFor?: (notificationId: string) => { id: string; label: string }[];
};

export function ChatThread({
  messages,
  viewerMemberId,
  megaById,
  onLoadMore,
  onAnswerBlock,
  onReact,
  onChangeMemoryScope,
  onForgetMemory,
  onRespondRequest,
  onAnswerNotification,
  notificationButtonsFor,
}: ChatThreadProps) {
  return (
    <MessageList
      messages={messages}
      isMine={(m) => m.author.kind === 'member' && m.author.id === viewerMemberId}
      megaById={megaById}
      onLoadMore={onLoadMore}
      onAnswerBlock={onAnswerBlock}
      onReact={onReact}
      onChangeMemoryScope={onChangeMemoryScope}
      onForgetMemory={onForgetMemory}
      onRespondRequest={onRespondRequest}
      onAnswerNotification={onAnswerNotification}
      notificationButtonsFor={notificationButtonsFor}
      emptyLabel="No messages yet. Say hello."
    />
  );
}

export type { MessageDoc, SaveChip };
