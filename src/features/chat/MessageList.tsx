// Shared thread renderer for ChatThread and KidThreadView (PLAN §1 / §4) — the single place that owns
// how a page of messages is laid out, so the two don't duplicate it (DRY). `chat.thread` / `family.kidThread`
// both return pages newest-first (CONTRACT §4), so this renders them through an *inverted* FlatList:
// RN's own docs describe `inverted` as flipping the scroll direction (and swapping where
// ListHeaderComponent/ListFooterComponent land), which is exactly "index 0 sits at the visual bottom" —
// the newest message reads at the bottom like any chat app, and because new messages are *prepended* to
// index 0 (not appended), the list stays pinned there on its own; no scrollToEnd/ref bookkeeping needed.
// "Load earlier" fetches the page *after* the oldest loaded message, which an inverted list draws at the
// visual top, so it's the ListFooterComponent (not the header — that would render at the visual bottom).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer, SaveChip } from '@shared/domain/messages';
import type { Reaction, Scope } from '@shared/domain/enums';
import { LIMITS } from '@shared/config/limits';
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
  /** Rendered instead of `emptyLabel` when there are no messages (the chat screen's loading state while the
   * MEGA's starter is on its way; owner Oct 28: never an empty-state line in a chat). */
  emptyContent?: ReactNode;
  /** Extra room under the newest message (the list is inverted, so it's the content's top padding), e.g. a
   * parent's read-only kid chat above the tab bar (G4 UX review, Oct 28). */
  endPadding?: number;
  /** CONTRACT §6: a deep-link tap (`mega://chat/<messageId>`) lands here once that message is loaded —
   * scrolls the inverted FlatList to it and briefly highlights the row (MessageRow's `highlighted`). If
   * it isn't in the first loaded page, `onLoadMore` is called repeatedly (bounded by
   * LIMITS.chat.deepLinkMaxLoadMorePages) until it turns up or pagination runs out. */
  scrollToMessageId?: Id<'messages'>;
  /** G3 review fix (BLOCKER, deep link to an older message): true once `chat.thread`'s pagination has
   * no more pages to fetch (`usePaginatedQuery`'s `status === 'Exhausted'`) — distinct from `onLoadMore`
   * being momentarily `undefined` while a page is already in flight (`'LoadingMore'`), which just means
   * "wait for the next page," not "give up." Omitted (default false) by callers that don't support
   * `scrollToMessageId` in the first place, where it's never consulted anyway. */
  paginationExhausted?: boolean;
};

/** How long the "scrolled to from a notification" highlight stays before fading — long enough to be
 * seen after the scroll settles, short enough not to linger like a permanent marker. */
const HIGHLIGHT_DURATION_MS = 2200;

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
  emptyContent,
  endPadding,
  scrollToMessageId,
  paginationExhausted = false,
}: MessageListProps) {
  const tokens = useTokens();
  const listRef = useRef<FlatList<MessageDoc>>(null);
  // Only tracks when a highlight was *cleared* (by its own timeout) — whether a message is currently
  // highlighted is derived below, not stored, which is what lets a new `scrollToMessageId` light up
  // immediately without this effect calling setState synchronously on its own first run (the project's
  // react-hooks/set-state-in-effect rule: an effect should only set state from a later callback,
  // reacting to an external system, not synchronously in its own body).
  const [clearedHighlightId, setClearedHighlightId] = useState<Id<'messages'> | null>(null);
  const highlightedId = scrollToMessageId && scrollToMessageId !== clearedHighlightId ? scrollToMessageId : null;

  // G3 review fix (BLOCKER, deep link to an older message): a target that isn't in the first loaded
  // page used to just silently give up. `loadMoreAttempts` counts actual `onLoadMore()` calls made
  // while searching *for this one target* (reset the moment the target id changes), bounded by
  // LIMITS.chat.deepLinkMaxLoadMorePages — a ref, not state, since it's bookkeeping the search effect
  // itself owns and nothing else needs to read or re-render on.
  const loadMoreAttempts = useRef(0);
  const searchingFor = useRef<Id<'messages'> | null>(null);
  // "Never found" shown as a small notice rather than nothing — cleared the moment a *different* target
  // is requested, or the same one is finally found.
  const [notFoundId, setNotFoundId] = useState<Id<'messages'> | null>(null);

  // CONTRACT §6: lands once the target message is actually in `messages` (it may still be loading on
  // the first render after a cold-start deep link) — re-runs if the id changes to a different message
  // (tapping a second notification while the first's highlight hasn't faded yet), or as more pages load
  // in while still searching for it.
  useEffect(() => {
    if (!scrollToMessageId) {
      loadMoreAttempts.current = 0;
      searchingFor.current = null;
      return;
    }
    if (searchingFor.current !== scrollToMessageId) {
      searchingFor.current = scrollToMessageId;
      loadMoreAttempts.current = 0;
      setNotFoundId(null);
    }

    const index = messages.findIndex((m) => m._id === scrollToMessageId);
    if (index !== -1) {
      // Clearing a *previously shown* not-found notice the instant this same target turns up after all
      // (e.g. it arrives through a live update rather than the load-more path below) — same "escape
      // hatch" the project already uses in src/app/(tabs)/family/calendar.tsx, justified the same way:
      // synchronizing UI state with this effect's own search outcome, not spawning new work off of it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotFoundId(null);
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      } catch {
        // onScrollToIndexFailed (below) covers the "not measured yet" case; anything else shouldn't stop
        // the highlight itself from showing.
      }
      const timer = setTimeout(() => setClearedHighlightId(scrollToMessageId), HIGHLIGHT_DURATION_MS);
      return () => clearTimeout(timer);
    }

    // Not found in the loaded page(s) yet. Keep paging — bounded, and stopping the instant pagination
    // itself is exhausted — rather than returning silently. No scroll/jump happens while this runs: the
    // list stays wherever it already was (the inverted FlatList's own bottom anchor), so there's nothing
    // to flicker.
    if (paginationExhausted || loadMoreAttempts.current >= LIMITS.chat.deepLinkMaxLoadMorePages) {
      setNotFoundId(scrollToMessageId);
      return;
    }
    if (onLoadMore) {
      loadMoreAttempts.current += 1;
      onLoadMore();
    }
    // else: a page is already loading (the caller's onLoadMore is momentarily undefined while
    // `status === 'LoadingMore'`) — wait for `messages` to update again rather than counting this as a
    // wasted attempt.
  }, [scrollToMessageId, messages, onLoadMore, paginationExhausted]);

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
      // G3 review fix (BLOCKER, "From a notification" notice — CONTRACT §6, PLAN §6, design board
      // Push.template.html ~125): shown above the one message the chat was actually entered for (tap,
      // cold start, or a deep link with a messageId that carries `fromNotificationId`, CONTRACT §2) —
      // tied to `scrollToMessageId` itself (the route param), not the highlight wash, so it stays for as
      // long as that deep link is the reason this screen is open, past the highlight's own fade.
      const noticeSentAt = item._id === scrollToMessageId && item.fromNotificationId ? notificationsById?.[item.fromNotificationId]?.sentAt : undefined;
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
          highlighted={item._id === highlightedId}
          noticeSentAt={noticeSentAt}
        />
      );
    },
    [isMine, megaById, getAnswerBlockCallback, getReactCallback, stableChangeMemoryScope, stableForgetMemory, getRespondRequestCallback, getAnswerNotificationCallback, notificationsById, chipsReadOnly, highlightedId, scrollToMessageId],
  );

  if (messages.length === 0) {
    if (emptyContent) return <>{emptyContent}</>;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
        <Text color="muted">{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={messages}
        inverted
        keyExtractor={(m) => m._id}
        contentContainerStyle={{ padding: tokens.spacing.lg, paddingTop: tokens.spacing.lg + (endPadding ?? 0) }}
        ListFooterComponent={onLoadMore ? <Button label="Load earlier messages" variant="ghost" onPress={onLoadMore} /> : undefined}
        renderItem={renderItem}
        // No `getItemLayout` (messages have variable height), so a `scrollToIndex` call made before that
        // row has actually been measured can fail — RN's documented fallback is to retry once layout
        // catches up, rather than leaving the deep link looking like it silently did nothing.
        onScrollToIndexFailed={(info) => {
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 100);
        }}
      />
      {/* G3 review fix (BLOCKER, deep link to an older message): shown instead of nothing once the
          target is never found (pagination exhausted or the page bound is hit) — a floating overlay, not
          part of the scrollable content, so it can't itself cause a layout jump in the list below it. */}
      {notFoundId && (
        <View pointerEvents="none" style={{ position: 'absolute', top: tokens.spacing.sm, left: tokens.spacing.lg, right: tokens.spacing.lg, alignItems: 'center' }}>
          <View style={{ backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.pill, paddingVertical: tokens.spacing.xs, paddingHorizontal: tokens.spacing.md }}>
            <Text variant="caption" color="muted">
              Couldn&rsquo;t find that message
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export type { MessageDoc, SaveChip };
