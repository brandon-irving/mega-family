// Shared thread renderer for ChatThread and KidThreadView (PLAN §1 / §4) — the single place that owns
// how a page of messages is laid out, so the two don't duplicate it (DRY). `chat.thread` / `family.kidThread`
// both return pages newest-first (CONTRACT §4), so this renders them through an *inverted* FlatList:
// RN's own docs describe `inverted` as flipping the scroll direction (and swapping where
// ListHeaderComponent/ListFooterComponent land), which is exactly "index 0 sits at the visual bottom" —
// the newest message reads at the bottom like any chat app, and because new messages are *prepended* to
// index 0 (not appended), the list stays pinned there on its own; no scrollToEnd/ref bookkeeping needed.
// "Load earlier" fetches the page *after* the oldest loaded message, which an inverted list draws at the
// visual top, so it's the ListFooterComponent (not the header — that would render at the visual bottom).
import { FlatList, View } from 'react-native';
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer, SaveChip } from '@shared/domain/messages';
import type { Reaction, Scope } from '@shared/domain/enums';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
import type { NotificationDoc } from '@/data/useNotifications';
import { MessageRow, type MessageDoc } from './MessageRow';

const noop = () => {};

export type MessageListProps = {
  messages: MessageDoc[];
  /** Whether `message` renders as the viewer's own bubble — differs between ChatThread (the signed-in
   * viewer's own authored messages) and KidThreadView (any member-authored message, since a kid's thread
   * has exactly one member in it: the kid being read, not the parent reading it). */
  isMine: (message: MessageDoc) => boolean;
  megaById: Record<string, MegaInfo>;
  onLoadMore?: () => void;
  onAnswerBlock?: (messageId: Id<'messages'>, answer: BlockAnswer) => void;
  onReact?: (messageId: Id<'messages'>, reaction: Reaction | null) => void;
  onChangeMemoryScope?: (memoryId: Id<'memories'>, scope: Scope) => void;
  onForgetMemory?: (memoryId: Id<'memories'>) => void;
  onRespondRequest?: (requestId: string, accept: boolean) => void;
  onAnswerNotification?: (notificationId: string, buttonId: string) => void;
  /** notificationId -> its resolved doc (see `@/data/useNotifications`), so a `{ kind: 'notification' }`
   * card can render real content instead of just the word "Notification" (G1 fix). */
  notificationsById?: Record<string, NotificationDoc>;
  emptyLabel?: string;
};

export function MessageList({
  messages,
  isMine,
  megaById,
  onLoadMore,
  onAnswerBlock = noop,
  onReact = noop,
  onChangeMemoryScope = noop,
  onForgetMemory = noop,
  onRespondRequest,
  onAnswerNotification,
  notificationsById,
  emptyLabel = 'No messages yet.',
}: MessageListProps) {
  const tokens = useTokens();

  if (messages.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
        <Text color="muted">{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={messages}
      inverted
      keyExtractor={(m) => m._id}
      contentContainerStyle={{ padding: tokens.spacing.lg }}
      ListFooterComponent={onLoadMore ? <Button label="Load earlier messages" variant="ghost" onPress={onLoadMore} /> : undefined}
      renderItem={({ item }) => {
        const mine = isMine(item);
        const mega = item.author.kind === 'mega' ? megaById[item.author.id] ?? null : null;
        const card = item.body.type === 'card' ? item.body.card : null;
        const requestId = card?.kind === 'request' ? card.requestId : null;
        const notificationId = card?.kind === 'notification' ? card.notificationId : null;
        return (
          <MessageRow
            message={item}
            isMine={mine}
            mega={mega}
            onAnswerBlock={(answer) => onAnswerBlock(item._id, answer)}
            onReact={(reaction) => onReact(item._id, reaction)}
            onChangeMemoryScope={(memoryId, scope) => onChangeMemoryScope(memoryId as Id<'memories'>, scope)}
            onForgetMemory={(memoryId) => onForgetMemory(memoryId as Id<'memories'>)}
            onRespondRequest={requestId ? (accept) => onRespondRequest?.(requestId, accept) : undefined}
            onAnswerNotification={notificationId ? (buttonId) => onAnswerNotification?.(notificationId, buttonId) : undefined}
            notification={notificationId ? notificationsById?.[notificationId] : undefined}
          />
        );
      }}
    />
  );
}

export type { MessageDoc, SaveChip };
