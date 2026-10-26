// Shared thread renderer for ChatThread and KidThreadView (PLAN §1 / §4) — the single place that owns
// how a page of messages is laid out, so the two don't duplicate it (DRY). `chat.thread` / `family.kidThread`
// both return pages newest-first (CONTRACT §4), so this renders them through an *inverted* FlatList:
// RN's own docs describe `inverted` as flipping the scroll direction (and swapping where
// ListHeaderComponent/ListFooterComponent land), which is exactly "index 0 sits at the visual bottom" —
// the newest message reads at the bottom like any chat app, and because new messages are *prepended* to
// index 0 (not appended), the list stays pinned there on its own; no scrollToEnd/ref bookkeeping needed.
// "Load earlier" fetches the page *after* the oldest loaded message, which an inverted list draws at the
// visual top, so it's the ListFooterComponent (not the header — that would render at the visual bottom).
import { useCallback, useLayoutEffect, useRef } from 'react';
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

/** G2 fix item 4 (MessageList.tsx:76-96): a per-row callback keyed by item id, stable across *every*
 * MessageList re-render regardless of whether the latest-closure function passed in changed identity —
 * which it always does here, since ChatRoute/ChatThread recreate their `onAnswerBlock`/`onReact`/…
 * callbacks on every render. Without this, `renderItem` would need a fresh `(answer) => onAnswerBlock(item._id,
 * answer)` closure per row on every render, which breaks MessageRow's `React.memo` bailout and re-renders
 * every mounted row each time a *single* row's text changes (e.g. one streamed token). Returns the *same*
 * bound function for a given id forever (bounded by the thread's size, which is finite per session), so a
 * row's own props stay referentially equal across renders where nothing about that row changed. */
function useRowCallback<Arg>(latest: (id: string, arg: Arg) => void) {
  const latestRef = useRef(latest);
  // Not a direct `latestRef.current = latest` during render — the React Compiler (app.config.ts) rejects
  // mutating a ref in the render phase outright. useLayoutEffect commits synchronously right after DOM
  // mutations, before the browser paints or the user can interact, so a press between this render and
  // the next always sees the latest closure.
  useLayoutEffect(() => {
    latestRef.current = latest;
  });
  const cache = useRef(new Map<string, (arg: Arg) => void>());
  return useCallback((id: string) => {
    let bound = cache.current.get(id);
    if (!bound) {
      bound = (arg: Arg) => latestRef.current(id, arg);
      cache.current.set(id, bound);
    }
    return bound;
  }, []);
}

/** The id-agnostic equivalent of useRowCallback: a callback whose own args already carry everything it
 * needs (no row-specific id to close over) still gets a fresh identity every render here otherwise,
 * since the function *passed in* changes every render — this holds one stable wrapper instead. */
function useStableCallback<Args extends unknown[]>(latest: (...args: Args) => void) {
  const latestRef = useRef(latest);
  useLayoutEffect(() => {
    latestRef.current = latest;
  });
  return useCallback((...args: Args) => latestRef.current(...args), []);
}

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
  /** Kids' save chips are read-only (PLAN "MEGA profile") — also true for KidThreadView, where a parent
   * is only ever reading, never editing a kid's memories. */
  chipsReadOnly?: boolean;
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
  chipsReadOnly = false,
  emptyLabel = 'No messages yet.',
}: MessageListProps) {
  const tokens = useTokens();

  const getAnswerBlockCallback = useRowCallback<BlockAnswer>((id, answer) => onAnswerBlock(id as Id<'messages'>, answer));
  const getReactCallback = useRowCallback<Reaction | null>((id, reaction) => onReact(id as Id<'messages'>, reaction));
  const getRespondRequestCallback = useRowCallback<boolean>((requestId, accept) => onRespondRequest?.(requestId, accept));
  const getAnswerNotificationCallback = useRowCallback<string>((notificationId, buttonId) => onAnswerNotification?.(notificationId, buttonId));
  // Neither of these closes over anything row-specific (memoryId/scope are already the callback's own
  // args, not derived from `item`) — one stable wrapper for the whole list, not one per row.
  const stableChangeMemoryScope = useStableCallback((memoryId: string, scope: Scope) => onChangeMemoryScope(memoryId as Id<'memories'>, scope));
  const stableForgetMemory = useStableCallback((memoryId: string) => onForgetMemory(memoryId as Id<'memories'>));

  // Stable across renders (useCallback, real deps) so FlatList/VirtualizedList's own per-cell memoization
  // isn't invalidated by a fresh `renderItem` identity every time MessageList re-renders for an unrelated
  // reason (e.g. the parent re-rendering because a streamed reply's caption is updating elsewhere).
  const renderItem = useCallback(
    ({ item }: { item: MessageDoc }) => {
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
          onAnswerBlock={getAnswerBlockCallback(item._id)}
          onReact={getReactCallback(item._id)}
          onChangeMemoryScope={stableChangeMemoryScope}
          onForgetMemory={stableForgetMemory}
          onRespondRequest={requestId ? getRespondRequestCallback(requestId) : undefined}
          onAnswerNotification={notificationId ? getAnswerNotificationCallback(notificationId) : undefined}
          notification={notificationId ? notificationsById?.[notificationId] : undefined}
          chipsReadOnly={chipsReadOnly}
        />
      );
    },
    [isMine, megaById, getAnswerBlockCallback, getReactCallback, stableChangeMemoryScope, stableForgetMemory, getRespondRequestCallback, getAnswerNotificationCallback, notificationsById, chipsReadOnly],
  );

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
      renderItem={renderItem}
    />
  );
}

export type { MessageDoc, SaveChip };
