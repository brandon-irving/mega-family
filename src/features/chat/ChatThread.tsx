// The scrollable thread: messages, reply buttons on blocks, result cards. Presentational — takes
// already-loaded messages (oldest first, as chat.thread's pagination returns them) and callbacks, so
// it can be driven by usePaginatedQuery in the route or by fixtures in tests. A plain FlatList that
// stays scrolled to the newest message; `onLoadMore` fires near the top to fetch older pages.
import { useEffect, useRef } from 'react';
import { FlatList, View } from 'react-native';
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer, SaveChip } from '@shared/domain/messages';
import type { Reaction, Scope } from '@shared/domain/enums';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { MessageRow, type MessageDoc } from './MessageRow';

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
  const tokens = useTokens();
  const listRef = useRef<FlatList<MessageDoc>>(null);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
        <Text color="muted">No messages yet. Say hello.</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(m) => m._id}
      contentContainerStyle={{ padding: tokens.spacing.lg }}
      ListHeaderComponent={onLoadMore ? <Button label="Load earlier messages" variant="ghost" onPress={onLoadMore} /> : undefined}
      renderItem={({ item }) => {
        const isMine = item.author.kind === 'member' && item.author.id === viewerMemberId;
        const mega = item.author.kind === 'mega' ? megaById[item.author.id] ?? null : null;
        const card = item.body.type === 'card' ? item.body.card : null;
        const requestId = card?.kind === 'request' ? card.requestId : null;
        const notificationId = card?.kind === 'notification' ? card.notificationId : null;
        return (
          <MessageRow
            message={item}
            isMine={isMine}
            mega={mega}
            onAnswerBlock={(answer) => onAnswerBlock(item._id, answer)}
            onReact={(reaction) => onReact(item._id, reaction)}
            onChangeMemoryScope={(memoryId, scope) => onChangeMemoryScope(memoryId as Id<'memories'>, scope)}
            onForgetMemory={(memoryId) => onForgetMemory(memoryId as Id<'memories'>)}
            onRespondRequest={requestId ? (accept) => onRespondRequest?.(requestId, accept) : undefined}
            onAnswerNotification={notificationId ? (buttonId) => onAnswerNotification?.(notificationId, buttonId) : undefined}
            notificationButtons={notificationId ? notificationButtonsFor?.(notificationId) : undefined}
          />
        );
      }}
    />
  );
}

export type { SaveChip };
