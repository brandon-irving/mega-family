import { ageGroupOf } from '@shared/ageGroups';
import { ChatEntrance } from '@/features/chat/ChatEntrance';
import { CHAT_UX } from '@shared/config/chat';
import { DemoSessionBar } from '@/features/settings/DemoSessionBar';
import { LiveMegaDraft } from '@/features/chat/LiveMegaDraft';
// Chat keeps completed and streaming replies in one virtualized conversation.
// Reads data only through the small hooks in src/data/.
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { router } from '@/features/shell/navigation';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import type { Id } from '@shared/domain/validators';
import { ROLES_CONFIG } from '@shared/config/roles';
import { CHAT_COPY, G5_COPY } from '@shared/config/copy';
import { LINKS } from '@shared/domain/api';
import { useViewer } from '@/data/useViewer';
import { useOnboardingState } from '@/data/useOnboarding';
import { useStopResponse, useAnswerBlock, useChatThread, useReactToMessage, useSendMessage, useStartChat, useStreamBody } from '@/data/useChat';
import { pendingMegaStreamId } from '@/features/chat/pendingStream';
import { useToday, useAnswerNotification } from '@/data/useToday';
import { useNotificationsFor } from '@/data/useNotifications';
import { useChangeMemoryScope, useForgetMemory } from '@/data/useMega';
import { useSaveMessageIdea } from '@/data/useIdeas';
import { useMegaDirectory } from '@/data/useMegaDirectory';
import { usePushNotifications } from '@/data/usePush';
import { usePhoneAutoSync } from '@/features/accounts/usePhoneCalendarFlow';
import { setChatFocused } from '@/services/chatFocus';
import { errorCopyFor, streamStatusCopy } from '@/data/errorCopy';
import { Screen } from '@/ui/Screen';
import { MegaLoader } from '@/features/walkers';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { useTokens } from '@/ui/theme';
import { megaInfo } from '@/features/shell/megaInfo';
import { isAdultRole } from '@/features/shell/familyDirectory';
import { toPath } from '@/features/shell/links';
import { ChatHeader } from '@/features/chat/ChatHeader';
import { ChatThread } from '@/features/chat/ChatThread';
import { useAttachments } from '@/features/chat/Attachments';
import { Composer } from '@/features/chat/Composer';
import { StreamingReply } from '@/features/chat/StreamingReply';
import { TabBottomInset } from '@/ui/TabBottomInset';

export default function ChatRoute() {
  const { messageId } = useLocalSearchParams<{ messageId?: string }>();
  const viewer = useViewer();
  const thread = useChatThread();
  const today = useToday();
  const megaById = useMegaDirectory();
  const onboarding = useOnboardingState();
  const sendMessage = useSendMessage();
  const stopResponse = useStopResponse();
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const answerBlock = useAnswerBlock();
  const react = useReactToMessage();
  const changeMemoryScope = useChangeMemoryScope();
  const forgetMemory = useForgetMemory();
  const answerNotification = useAnswerNotification();
  const saveMessageIdea = useSaveMessageIdea();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [pendingStreamId, setPendingStreamId] = useState<string | null>(null);
  // The active reply follows whichever MEGA reply is still being written: the viewer's last send, or one
  // they didn't send (a block answer's follow-up, a kid's "Show me", the MEGA's own starter).
  const writingStreamId = thread.status === 'LoadingFirstPage' ? null : pendingMegaStreamId(thread.results);
  const stream = useStreamBody(writingStreamId ?? pendingStreamId);
  // Owner, Oct 28: MEGAs start the conversation (chat.start, once per thread).
  useStartChat(!!viewer?.mega && thread.status !== 'LoadingFirstPage');
  const [sendError, setSendError] = useState<{ line: string; retryText: string } | null>(null);
  const reducedMotion = useReducedMotion();

  // G3 scope: permission prompt "at a sensible moment" — right here, the first time someone actually
  // lands in their own chat (never from welcome/invite/onboarding), plus the response listener/cold-start
  // deep-link handling (CONTRACT §5/§6). See src/data/usePush.ts.
  usePushNotifications();
  // G5: this phone's calendar re-syncs on open when it's due (DEVICE_CALENDAR.syncEveryMinutes).
  usePhoneAutoSync();

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
      setSendError(null); setSending(true); setStopError(null);
      try {
        const result = await sendMessage({ text, via: 'text' });
        setPendingStreamId(result.streamId);
      } catch (e) {
        // Optimistic display already showed the bubble (useSendMessage's withOptimisticUpdate); Convex
        // rolls that back on its own once the mutation throws, so there's nothing to undo here beyond
        // surfacing the friendly line + a retry.
        setSendError({ line: errorCopyFor(e), retryText: text });
      } finally { setSending(false); }
    },
    [sendMessage],
  );

  const attachments = useAttachments(async file => {
    const result = await sendMessage({ text: `Attached: ${file.name}`, via: 'text', files: [file] });
    setPendingStreamId(result.streamId);
  });

  const onRetrySend = useCallback(() => {
    if (sendError) onSend(sendError.retryText);
  }, [sendError, onSend]);

  // The reply message appears in chat.thread once it's persisted; until then (or if the backend's
  // persistent-text-streaming wiring isn't live yet) this shows the partial text from streamBody.
  // The next onSend sets a fresh streamId, so there's no need to clear this one when it settles.
  const streamFailed = stream?.status === 'error' || stream?.status === 'timeout';
  const showStreamingReply = (writingStreamId ?? pendingStreamId) !== null && stream !== undefined && stream.status !== 'done' && !streamFailed;

  const activeStreamId = writingStreamId ?? pendingStreamId;
  const responding = sending || (!!activeStreamId && stream?.status !== 'done' && !streamFailed);
  const stop = async () => {
    if (!activeStreamId || stopping) return;
    setStopping(true); setStopError(null);
    try { await stopResponse({ streamId: activeStreamId }); }
    catch (error) { setStopError(errorCopyFor(error)); }
    finally { setStopping(false); }
  };

  const mega = useMemo(() => (viewer?.mega ? megaInfo(viewer.mega) : null), [viewer]);

  if (viewer === undefined || thread.status === 'LoadingFirstPage') return <MegaLoader text={CHAT_COPY.opening} testID="chat-loading" />;
  if (!viewer || !mega) {
    return (
      <Screen presentation="tab">
        <Text color="muted">No MEGA yet — onboarding creates one first.</Text>
      </Screen>
    );
  }

  const bigTalkButton = ROLES_CONFIG[viewer.member.role].talkButton && ageGroupOf(viewer.member, new Date().toISOString().slice(0, 10)) === 'child';
  const todayCount = today?.waitingOnYou.length ?? 0;

  return (
    // KeyboardAvoidingView from react-native-keyboard-controller (not RN core): resizes the column
    // smoothly and keeps the inverted FlatList's newest message pinned at the visual bottom as the
    // keyboard rises, instead of RN core's version jumping on Android / over-shooting on iOS.
    // TabBottomInset: the chat tab pads its own bottom for iOS 26's floating tab bar (src/features/shell/tabs.ts
    // `manualInsets`); on web it's a plain flex view.
    <TabBottomInset>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Screen padded={false} presentation="tab">
          <DemoSessionBar />
          <ChatEntrance hasHistory={thread.results.some(message => message.author.kind === 'member')} key={viewer.member._id} memberId={viewer.member._id} mega={mega}>{({ avatarRef, onAvatarLayout }) => <>
          <ChatHeader avatarRef={avatarRef} onAvatarLayout={onAvatarLayout}
            mega={mega}
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
              paginationExhausted={thread.status === 'Exhausted'}
              onAnswerBlock={(id, answer) => answerBlock(id, answer, 'text')}
              onReply={setReplyTo}
              onReact={(id, reaction) => react({ messageId: id, reaction })}
              onSaveIdea={isAdultRole(viewer.member.role) ? (id) => saveMessageIdea({ messageId: id }) : undefined}
              onChangeMemoryScope={(memoryId, scope) => changeMemoryScope({ memoryId, scope })}
              onForgetMemory={(memoryId) => forgetMemory({ memoryId })}
              onAnswerNotification={(notificationId, buttonId) => answerNotification({ notificationId: notificationId as Id<'notifications'>, buttonId, via: 'block' })}
              notificationsById={notificationsById}
              streamingReply={showStreamingReply && stream ? <StreamingReply megaHex={mega.hex} megaName={mega.name} text={stream.text} /> : undefined}
              scrollToMessageId={messageId as Id<'messages'> | undefined}
            />
          </View>
          {/* A streamed-reply failure has no text to resend (the message itself already sent fine) — just
              the friendly line, no retry button. */}
          {streamFailed && <RetryBanner label={streamStatusCopy(stream!.status as 'error' | 'timeout')} reducedMotion={reducedMotion} />}
          {sendError && <RetryBanner label={sendError.line} onRetry={onRetrySend} reducedMotion={reducedMotion} />}
          <LiveMegaDraft />
          {stopError && <Text accessibilityRole="alert">{stopError}</Text>}
          <Composer responding={responding} stopping={stopping} onStop={!sending && activeStreamId ? () => void stop() : undefined}
            megaName={mega.name}
            bigTalkButton={bigTalkButton}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSend={text => { const quoted = replyTo ? `Replying to: “${replyTo.slice(0, CHAT_UX.maxQuotedCharacters)}”\n\n${text}` : text; setReplyTo(null); void onSend(quoted); }}
            onOpenTalk={() => router.push(toPath(LINKS.talk()) as never)}
            // GD (board KidsSnap): grown-ups can snap a worksheet for homework practice.
            onCamera={isAdultRole(viewer.member.role) ? attachments.open : undefined}
            // G5 onboarding (board OnboardChat): the name goes in the composer; the server reads it as the name.
            placeholder={onboarding?.step === 'name' ? G5_COPY.namePlaceholder : undefined}
          />
          {attachments.sheets}
          </>}</ChatEntrance>
        </Screen>
      </KeyboardAvoidingView>
    </TabBottomInset>
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
