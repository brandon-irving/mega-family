import { CHAT_UX } from '@shared/config/chat';
import { FileAttachment } from './FileAttachment';
// Renders one thread message of any MessageBody type (CONTRACT §3): text, block, answer, card,
// image, notice. Text messages share bubbles; cards keep their own layout.
import { memo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ModalSheet } from '@/ui/ModalSheet';
import { Button } from '@/ui/Button';
import { Pressable, View } from 'react-native';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';
import type { Infer } from 'convex/values';
import type { messageDoc } from '@shared/domain/api';
import type { BlockAnswer } from '@shared/domain/messages';
import type { Reaction, Scope } from '@shared/domain/enums';
import { messageBubbleColors, USER_BUBBLE } from '@shared/config/theme';
import { Bubble } from '@/ui/Bubble';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
import type { NotificationDoc } from '@/data/useNotifications';
import { errorCopyFor } from '@/data/errorCopy';
import { AnsweredBlock, Block } from './Blocks';
import { ResultCard } from './Cards';
import { NotificationNotice } from './NotificationNotice';
import { isMegaStillWriting } from './pendingStream';
import { SaveChip } from './SaveChip';

export type MessageDoc = Infer<typeof messageDoc>;

export type MessageRowProps = {
  message: MessageDoc;
  isMine: boolean;
  mega: MegaInfo | null;
  onAnswerBlock: (answer: BlockAnswer) => void;
  onReact?: (reaction: Reaction | null) => void;
  onReply?: (text: string) => void;
  onSaveIdea?: () => Promise<unknown>;
  onChangeMemoryScope: (memoryId: string, scope: Scope) => void;
  onForgetMemory: (memoryId: string) => void;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  notification?: NotificationDoc;
  /** Kids' save chips are read-only (PLAN "MEGA profile": no sharing/memory controls for kids). */
  chipsReadOnly?: boolean;
  /** CONTRACT §6: a deep-link tap scrolls the thread to this message — this briefly washes it in the
   * accent color so "scrolled to" reads as a deliberate highlight, not just a jump. MessageList owns the
   * timer that flips this back to false, which is what lets Reanimated's `exiting` play the fade-out. */
  highlighted?: boolean;
  /** G3 review fix (BLOCKER, "From a notification" notice): when the chat was entered for *this*
   * message (CONTRACT §6), the `sentAt` of the notification it came from — renders the notice pill
   * above the row. `undefined`/`null` renders nothing (MessageList only ever passes a value for the one
   * deep-linked row, CONTRACT §2 `messages.fromNotificationId`). */
  noticeSentAt?: number | null;
};

/** Memoized (React.memo): MessageList re-renders on every new message, but a row's own props only
 * change when its message/callbacks actually do — un-memoized, the whole visible page would re-render
 * (and replay a layout pass) on each new arrival, the opposite of a 60fps chat list. */
export const MessageRow = memo(function MessageRow({
  message,
  isMine,
  mega,
  onAnswerBlock,
  onSaveIdea,
  onReact,
  onReply,
  onChangeMemoryScope,
  onForgetMemory,
  onRespondRequest,
  onAnswerNotification,
  notification,
  chipsReadOnly = false,
  highlighted = false,
  noticeSentAt,
}: MessageRowProps) {
  const tokens = useTokens();
  const reducedMotion = useReducedMotion();
  const [saveState, setSaveState] = useState<'ready' | 'saving' | 'saved'>('ready');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The list's streaming reply shows the draft until its persisted message is ready.
  if (isMegaStillWriting(message)) return null;
  const isMega = message.author.kind === 'mega';
  // Only textual content gets the native message action menu.
  const messageText = message.body.type === 'text' ? message.body.text : message.body.type === 'answer' ? message.body.label : null;
  const content = <Body message={message} isMine={isMine} mega={mega} onAnswerBlock={onAnswerBlock} onRespondRequest={onRespondRequest} onAnswerNotification={onAnswerNotification} notification={notification} />;

  return (
    <View style={{ marginBottom: tokens.spacing.md }}>
      {noticeSentAt != null && <NotificationNotice sentAt={noticeSentAt} />}
      {highlighted && (
        // CONTRACT §6 "From a notification" deep link: a brief accent wash so the scrolled-to message
        // reads as deliberately found, not just the list happening to land there. `exiting` only plays
        // because MessageList flips `highlighted` back to false on a timer rather than unmounting this
        // row outright — reduced motion renders the same wash with no animation either way (a flat color,
        // not motion, so there's nothing to suppress for that preference).
        <Animated.View
          pointerEvents="none"
          exiting={reducedMotion ? undefined : FadeOut.duration(tokens.durations.slow)}
          style={{ position: 'absolute', top: -tokens.spacing.xs, bottom: -tokens.spacing.xs, left: -tokens.spacing.sm, right: -tokens.spacing.sm, backgroundColor: tokens.accent, opacity: 0.16, borderRadius: tokens.radii.md }}
        />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
        {/* The column, not the bubble, carries the width limit: a bubble's own percentage maxWidth resolved
            against a parent with no width, so long messages were clipped off the left edge on web and short
            ones ("Answered") wrapped mid-word (owner, Oct 28). */}
        <View testID="message-column" style={{ flex: isMine ? undefined : 1, flexShrink: 1, maxWidth: message.body.type === 'text' || message.body.type === 'answer' ? CHAT_UX.bubbleMaxWidth : '100%' }}>
          {message.body.type === 'text' ? <Pressable accessibilityLabel={`${isMine ? 'You' : 'MEGA'}: ${messageText}. Hold for actions`} onLongPress={() => { setActionsOpen(true); setSelecting(false); setActionError(null); }}>
            <Bubble mine={isMine} accent={!isMine ? mega?.hex : undefined}>{content}</Bubble>
          </Pressable> : content}
          {message.reaction && <Text variant="caption" color="muted">{CHAT_UX.reactions.find(reaction => reaction.id === message.reaction)?.selected}</Text>}
        </View>
      </View>
      {isMega && message.saveableIdea === true && message.body.type === 'text' && message.body.text.trim() && onSaveIdea && !chipsReadOnly && (
        <View style={{ alignItems: 'flex-start', marginTop: tokens.spacing.xs }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saveState === 'saved' ? 'Saved to Ideas' : saveState === 'saving' ? 'Saving idea' : 'Save idea'}
            accessibilityState={{ disabled: saveState !== 'ready', busy: saveState === 'saving' }}
            disabled={saveState !== 'ready'}
            onPress={async () => {
              setSaveState('saving');
              setSaveError(null);
              try {
                await onSaveIdea();
                setSaveState('saved');
              } catch (error) {
                setSaveState('ready');
                setSaveError(errorCopyFor(error));
              }
            }}
            style={({ pressed }) => ({ minHeight: tokens.touchTarget, justifyContent: 'center', paddingRight: tokens.spacing.md, opacity: pressed ? 0.6 : 1 })}
          >
            <Text variant="caption" color="muted">{saveState === 'saved' ? 'Saved to Ideas' : saveState === 'saving' ? 'Saving…' : 'Save idea'}</Text>
          </Pressable>
          {saveError && <Text variant="caption" color="muted" accessibilityLiveRegion="polite">{saveError}</Text>}
        </View>
      )}
      {actionsOpen && messageText !== null && <ModalSheet open closeLabel={CHAT_UX.actions.close} title={selecting ? CHAT_UX.actions.select : CHAT_UX.actions.title} onClose={() => setActionsOpen(false)}>
        {selecting ? <Text selectable>{messageText}</Text> : <>
          <Button label={CHAT_UX.actions.copy} variant="secondary" onPress={async () => { try { await Clipboard.setStringAsync(messageText); setActionsOpen(false); } catch (error) { setActionError(errorCopyFor(error)); } }} />
          <Button label={CHAT_UX.actions.select} variant="secondary" onPress={() => setSelecting(true)} />
          {onReply && <Button label={CHAT_UX.actions.reply} variant="secondary" onPress={() => { setActionsOpen(false); onReply(messageText); }} />}
          {isMega && onReact && <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            {CHAT_UX.reactions.map(reaction => <Button key={reaction.id} label={reaction.label} variant="secondary" onPress={async () => { try { await onReact(message.reaction === reaction.id ? null : reaction.id); setActionsOpen(false); } catch (error) { setActionError(errorCopyFor(error)); } }} />)}
          </View>}
        </>}
        {actionError && <Text accessibilityRole="alert">{actionError}</Text>}
      </ModalSheet>}
      {message.chips.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginTop: tokens.spacing.xs }}>
          {message.chips.map((chip) => (
            <SaveChip
              key={chip.memoryId}
              chip={chip}
              onChangeScope={(scope) => onChangeMemoryScope(chip.memoryId, scope)}
              onForget={() => onForgetMemory(chip.memoryId)}
              readOnly={chipsReadOnly}
            />
          ))}
        </View>
      )}
    </View>
  );
});

function Body({
  message,
  isMine,
  mega,
  onAnswerBlock,
  onRespondRequest,
  onAnswerNotification,
  notification,
}: {
  message: MessageDoc;
  isMine: boolean;
  mega: MegaInfo | null;
  onAnswerBlock: (answer: BlockAnswer) => void;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  notification?: NotificationDoc;
}) {
  const tokens = useTokens();
  const body = message.body;
  // The own bubble background is darkened by the same shared palette helper.
  const onAccentText = isMine ? USER_BUBBLE.text : messageBubbleColors(mega?.hex ?? tokens.accent).text;
  const tinted = isMine || !!mega;
  switch (body.type) {
    case 'text':
      return <Text style={tinted ? { color: onAccentText } : undefined}>{body.text}</Text>;
    case 'block': {
      // Replace a completed card with its answer without an entrance or layout animation.
      return (
        <View>
          {body.answeredWith ? <AnsweredBlock block={body.block} answer={body.answeredWith} /> : <Block block={body.block} onAnswer={onAnswerBlock} conversationOnly />}
        </View>
      );
    }
    case 'answer':
      return (
        <Bubble mine={isMine} accent={!isMine ? mega?.hex : undefined}>
          <Text style={tinted ? { color: onAccentText } : undefined}>{body.label}</Text>
        </Bubble>
      );
    case 'card':
      return <ResultCard card={body.card} onRespondRequest={onRespondRequest} onAnswerNotification={onAnswerNotification} notification={notification} megaName={mega?.name} />;
    case 'image':
      return <FileAttachment messageId={message._id} photo name={body.caption ?? 'Shared photo'} />;
    case 'file':
      return <FileAttachment messageId={message._id} name={body.name} />;
    case 'notice':
      return (
        <Text variant="caption" color="muted" style={{ fontStyle: 'italic' }}>
          {body.text}
        </Text>
      );
  }
}
