// Chat screen (PLAN §1). Header with animated badge/name/status + Today button; thread via
// usePaginatedQuery(chat.thread); composer with + / text+@ / mic. Reads data only through the
// small hooks in src/data/.
import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import type { Id } from '@shared/domain/validators';
import { ROLES_CONFIG } from '@shared/config/roles';
import { LINKS } from '@shared/domain/api';
import { useViewer } from '@/data/useViewer';
import { useAnswerBlock, useChatThread, useReactToMessage, useSendMessage, useStreamBody } from '@/data/useChat';
import { useToday, useAnswerNotification } from '@/data/useToday';
import { useNotificationsFor } from '@/data/useNotifications';
import { useChangeMemoryScope, useForgetMemory } from '@/data/useMega';
import { useMegaDirectory } from '@/data/useMegaDirectory';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Text } from '@/ui/Text';
import { megaInfo } from '@/features/shell/megaInfo';
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
      const result = await sendMessage({ text, via: 'text' });
      setPendingStreamId(result.streamId);
    },
    [sendMessage],
  );

  // The reply message appears in chat.thread once it's persisted; until then (or if the backend's
  // persistent-text-streaming wiring isn't live yet) this shows the partial text from streamBody.
  // The next onSend sets a fresh streamId, so there's no need to clear this one when it settles.
  const showStreamBanner = pendingStreamId !== null && stream !== undefined && stream.status !== 'done' && stream.status !== 'error' && stream.status !== 'timeout';

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            megaById={megaById}
            onLoadMore={thread.status === 'CanLoadMore' ? () => thread.loadMore(30) : undefined}
            onAnswerBlock={(id, answer) => answerBlock(id, answer, 'text')}
            onReact={(id, reaction) => react({ messageId: id, reaction })}
            onChangeMemoryScope={(memoryId, scope) => changeMemoryScope({ memoryId, scope })}
            onForgetMemory={(memoryId) => forgetMemory({ memoryId })}
            onAnswerNotification={(notificationId, buttonId) => answerNotification({ notificationId: notificationId as Id<'notifications'>, buttonId, via: 'block' })}
            notificationsById={notificationsById}
          />
        </View>
        {showStreamBanner && stream && (
          <Text variant="caption" color="muted" style={{ paddingHorizontal: 16, paddingBottom: 4 }} accessibilityLiveRegion="polite">
            {mega.name}: {stream.text || '…'}
          </Text>
        )}
        <Composer megaName={mega.name} bigTalkButton={bigTalkButton} onSend={onSend} onOpenTalk={() => router.push(toPath(LINKS.talk()) as never)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
