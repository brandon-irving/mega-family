// Chat screen (PLAN §1). Header with animated badge/name/status + Today button; thread via
// usePaginatedQuery(chat.thread); composer with + / text+@ / mic. Reads data only through the
// small hooks in src/data/.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Id } from '@shared/domain/validators';
import { ROLES_CONFIG } from '@shared/config/roles';
import { LINKS } from '@shared/domain/api';
import { useViewer } from '@/data/useViewer';
import { useAnswerBlock, useChatThread, useReactToMessage, useSendMessage, useStreamBody } from '@/data/useChat';
import { useToday, useAnswerNotification } from '@/data/useToday';
import { useNotificationsFor } from '@/data/useNotifications';
import { useChangeMemoryScope, useForgetMemory } from '@/data/useMega';
import { useMegaDirectory } from '@/data/useMegaDirectory';
import { usePushNotifications } from '@/data/usePush';
import { setChatFocused } from '@/services/chatFocus';
import { errorCopyFor, streamStatusCopy } from '@/data/errorCopy';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { MegaBadge } from '@/ui/MegaBadge';
import { useTokens } from '@/ui/theme';
import { megaInfo, type MegaInfo } from '@/features/shell/megaInfo';
import { toPath } from '@/features/shell/links';
import { ChatHeader } from '@/features/chat/ChatHeader';
import { ChatThread } from '@/features/chat/ChatThread';
import { Composer } from '@/features/chat/Composer';

export default function ChatRoute() {
  const { messageId } = useLocalSearchParams<{ messageId?: string }>();
  const viewer = useViewer();
  const thread = useChatThread();
  const today = useToday();
  const megaById = useMegaDirectory();
  const sendMessage = useSendMessage();
  const answerBlock = useAnswerBlock();
  const react = useReactToMessage();
  const changeMemoryScope = useChangeMemoryScope();
  const forgetMemory = useForgetMemory();
  const answerNotification = useAnswerNotification();
  const [pendingStreamId, setPendingStreamId] = useState<string | null>(null);
  const stream = useStreamBody(pendingStreamId);
  const [sendError, setSendError] = useState<{ line: string; retryText: string } | null>(null);
  const reducedMotion = useReducedMotion();

  // G3 scope: permission prompt "at a sensible moment" — right here, the first time someone actually
  // lands in their own chat (never from welcome/invite/onboarding), plus the response listener/cold-start
  // deep-link handling (CONTRACT §5/§6). See src/data/usePush.ts.
  usePushNotifications();

  // G3 scope: "a push arriving while that chat is open should not double-show" — chatFocus.ts's module
  // flag is what push.ts's foreground notification handler reads (it can't read React context).
  useFocusEffect(
    useCallback(() => {
      setChatFocused(true);
      return () => setChatFocused(false);
    }, []),
  );

  // Every `{ kind: 'notification' }` card in the loaded page, resolved to its real content (G1 fix: the
  // card only ever carried an id, so it rendered just the word "Notification").
  const notificationIds = useMemo(
    () =>
      Array.from(
        new Set(
          thread.results
            .map((m) => (m.body.type === 'card' && m.body.card.kind === 'notification' ? m.body.card.notificationId : null))
            .filter((id): id is Id<'notifications'> => id !== null),
        ),
      ),
    [thread.results],
  );
  const notificationsById = useNotificationsFor(notificationIds);

  const onSend = useCallback(
    async (text: string) => {
      setSendError(null);
      try {
        const result = await sendMessage({ text, via: 'text' });
        setPendingStreamId(result.streamId);
      } catch (e) {
        // Optimistic display already showed the bubble (useSendMessage's withOptimisticUpdate); Convex
        // rolls that back on its own once the mutation throws, so there's nothing to undo here beyond
        // surfacing the friendly line + a retry.
        setSendError({ line: errorCopyFor(e), retryText: text });
      }
    },
    [sendMessage],
  );

  const onRetrySend = useCallback(() => {
    if (sendError) onSend(sendError.retryText);
  }, [sendError, onSend]);

  // The reply message appears in chat.thread once it's persisted; until then (or if the backend's
  // persistent-text-streaming wiring isn't live yet) this shows the partial text from streamBody.
  // The next onSend sets a fresh streamId, so there's no need to clear this one when it settles.
  const streamFailed = stream?.status === 'error' || stream?.status === 'timeout';
  const showStreamBanner = pendingStreamId !== null && stream !== undefined && stream.status !== 'done' && !streamFailed;

  const mega = useMemo(() => (viewer?.mega ? megaInfo(viewer.mega) : null), [viewer]);

  if (viewer === undefined || thread.status === 'LoadingFirstPage') return <LoadingScreen label="Opening chat…" />;
  if (!viewer || !mega) {
    return (
      <Screen>
        <Text color="muted">No MEGA yet — onboarding creates one first.</Text>
      </Screen>
    );
  }

  const bigTalkButton = ROLES_CONFIG[viewer.member.role].talkButton;
  const todayCount = today?.waitingOnYou.length ?? 0;

  return (
    // KeyboardAvoidingView from react-native-keyboard-controller (not RN core): resizes the column
    // smoothly and keeps the inverted FlatList's newest message pinned at the visual bottom as the
    // keyboard rises, instead of RN core's version jumping on Android / over-shooting on iOS.
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen padded={false}>
        <ChatHeader
          mega={mega}
          statusLine={viewer.mega ? 'Ready to help' : ''}
          todayCount={todayCount}
          onOpenProfile={() => router.push('/mega-profile' as never)}
          onOpenToday={() => router.push(toPath(LINKS.today()) as never)}
        />
        <View style={{ flex: 1 }} accessibilityLabel={messageId ? `Scrolled to message ${messageId}` : undefined}>
          <ChatThread
            messages={thread.results}
            viewerMemberId={viewer.member._id}
            viewerRole={viewer.member.role}
            megaById={megaById}
            onLoadMore={thread.status === 'CanLoadMore' ? () => thread.loadMore(30) : undefined}
            onAnswerBlock={(id, answer) => answerBlock(id, answer, 'text')}
            onReact={(id, reaction) => react({ messageId: id, reaction })}
            onChangeMemoryScope={(memoryId, scope) => changeMemoryScope({ memoryId, scope })}
            onForgetMemory={(memoryId) => forgetMemory({ memoryId })}
            onAnswerNotification={(notificationId, buttonId) => answerNotification({ notificationId: notificationId as Id<'notifications'>, buttonId, via: 'block' })}
            notificationsById={notificationsById}
            scrollToMessageId={messageId as Id<'messages'> | undefined}
          />
        </View>
        {showStreamBanner && stream && <StreamingBanner mega={mega} text={stream.text} reducedMotion={reducedMotion} />}
        {/* A streamed-reply failure has no text to resend (the message itself already sent fine) — just
            the friendly line, no retry button. */}
        {streamFailed && <RetryBanner label={streamStatusCopy(stream!.status as 'error' | 'timeout')} reducedMotion={reducedMotion} />}
        {sendError && <RetryBanner label={sendError.line} onRetry={onRetrySend} reducedMotion={reducedMotion} />}
        <Composer megaName={mega.name} bigTalkButton={bigTalkButton} onSend={onSend} onOpenTalk={() => router.push(toPath(LINKS.talk()) as never)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** "The reply shows the badge + typing state while status is pending/streaming; streamed text animates
 * in" (G2 scope). CONTRACT §4 gives the in-progress text through `chat.streamBody`, separate from the
 * thread's own message rows, so this renders beside the thread rather than inside a MessageRow. */
function StreamingBanner({ mega, text, reducedMotion }: { mega: MegaInfo; text: string; reducedMotion: boolean }) {
  const tokens = useTokens();
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(tokens.durations.fast)}
      exiting={reducedMotion ? undefined : FadeOut.duration(tokens.durations.fast)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xs }}
    >
      <MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={24} accessibilityLabel={mega.name} />
      {text ? (
        // `layout` smooths each new chunk's height/width change instead of the line jumping as it grows.
        <Animated.View layout={reducedMotion ? undefined : LinearTransition.duration(tokens.durations.fast)} style={{ flex: 1 }}>
          <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
            {text}
          </Text>
        </Animated.View>
      ) : (
        <TypingDots megaName={mega.name} reducedMotion={reducedMotion} />
      )}
    </Animated.View>
  );
}

/** A looping pulse (not a one-shot entering/exiting animation) — withRepeat on a shared value is the
 * right primitive for an indefinite "still working" indicator, same durations.base token as everything
 * else here. Reduced motion gets a static "…" instead of the pulse. */
function TypingDots({ megaName, reducedMotion }: { megaName: string; reducedMotion: boolean }) {
  const tokens = useTokens();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(withSequence(withTiming(0.3, { duration: tokens.durations.slow }), withTiming(1, { duration: tokens.durations.slow })), -1, true);
  }, [reducedMotion, opacity, tokens.durations.slow]);

  const style = useAnimatedStyle(() => ({ opacity: reducedMotion ? 1 : opacity.value }));

  return (
    <Animated.Text
      style={[{ fontSize: tokens.type.caption.fontSize, lineHeight: tokens.type.caption.lineHeight, color: tokens.muted }, style]}
      accessibilityLabel={`${megaName} is typing`}
      accessibilityLiveRegion="polite"
    >
      {reducedMotion ? '…' : '•••'}
    </Animated.Text>
  );
}

function RetryBanner({ label, onRetry, reducedMotion }: { label: string; onRetry?: () => void; reducedMotion: boolean }) {
  const tokens = useTokens();
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(tokens.durations.fast)}
      exiting={reducedMotion ? undefined : FadeOut.duration(tokens.durations.fast)}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.sm }}
    >
      <Text variant="caption" color="muted" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
        {label}
      </Text>
      {onRetry && <Button label="Try again" variant="ghost" onPress={onRetry} />}
    </Animated.View>
  );
}
