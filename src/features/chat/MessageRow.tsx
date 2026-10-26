// Renders one thread message of any MessageBody type (CONTRACT §3): text, block, answer, card,
// image, notice. MEGA and system messages render without a bubble (a MegaBadge sits beside them,
// PLAN §1); only the viewer's own messages are bubbles.
import { memo } from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import type { Infer } from 'convex/values';
import type { messageDoc } from '@shared/domain/api';
import type { BlockAnswer } from '@shared/domain/messages';
import type { Reaction, Scope } from '@shared/domain/enums';
import { readableOn } from '@shared/config/theme';
import { Bubble } from '@/ui/Bubble';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
import type { NotificationDoc } from '@/data/useNotifications';
import { AnsweredBlock, Block } from './Blocks';
import { ResultCard } from './Cards';
import { SaveChip } from './SaveChip';

export type MessageDoc = Infer<typeof messageDoc>;

export type MessageRowProps = {
  message: MessageDoc;
  isMine: boolean;
  mega: MegaInfo | null;
  onAnswerBlock: (answer: BlockAnswer) => void;
  onReact: (reaction: Reaction | null) => void;
  onChangeMemoryScope: (memoryId: string, scope: Scope) => void;
  onForgetMemory: (memoryId: string) => void;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  notification?: NotificationDoc;
  /** Kids' save chips are read-only (PLAN "MEGA profile": no sharing/memory controls for kids). */
  chipsReadOnly?: boolean;
};

/** Memoized (React.memo): MessageList re-renders on every new message, but a row's own props only
 * change when its message/callbacks actually do — un-memoized, the whole visible page would re-render
 * (and replay a layout pass) on each new arrival, the opposite of a 60fps chat list. */
export const MessageRow = memo(function MessageRow({
  message,
  isMine,
  mega,
  onAnswerBlock,
  onChangeMemoryScope,
  onForgetMemory,
  onRespondRequest,
  onAnswerNotification,
  notification,
  chipsReadOnly = false,
}: MessageRowProps) {
  const tokens = useTokens();
  const reducedMotion = useReducedMotion();
  const showBadge = message.author.kind === 'mega';
  const content = <Body message={message} isMine={isMine} onAnswerBlock={onAnswerBlock} onRespondRequest={onRespondRequest} onAnswerNotification={onAnswerNotification} notification={notification} />;

  return (
    // A new row mounts once per message (FlatList keeps existing rows mounted as more load in), so
    // `entering` plays exactly once, the moment this message first appears — not on every re-render —
    // which is what makes a freshly sent/received message slide in without replaying for the whole list.
    <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(tokens.durations.base).springify().damping(18)} style={{ marginBottom: tokens.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing.sm, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
        {showBadge && mega && <MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={32} accessibilityLabel={mega.name} />}
        <View style={{ flex: showBadge ? 1 : undefined, maxWidth: showBadge ? '82%' : undefined }}>
          {showBadge && mega && (
            <Text variant="caption" color="muted" style={{ marginBottom: 2 }}>
              {mega.name}
            </Text>
          )}
          {isMine && message.body.type === 'text' ? <Bubble mine>{content}</Bubble> : content}
        </View>
      </View>
      {message.chips.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginTop: tokens.spacing.xs, marginLeft: showBadge ? 40 : 0 }}>
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
    </Animated.View>
  );
});

function Body({
  message,
  isMine,
  onAnswerBlock,
  onRespondRequest,
  onAnswerNotification,
  notification,
}: {
  message: MessageDoc;
  isMine: boolean;
  onAnswerBlock: (answer: BlockAnswer) => void;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  notification?: NotificationDoc;
}) {
  const tokens = useTokens();
  const reducedMotion = useReducedMotion();
  const body = message.body;
  // G2 contrast fix ("own message bubble white on the Midnight theme's own teal accent is 2.44:1"): the
  // bubble's background is tokens.accent (Bubble.tsx), which can be the theme's own accent *or* a MEGA's
  // custom shell color — tokens.onAccent alone assumed white always reads on it, which fails WCAG AA for
  // that default teal. readableOn derives the actual passing color per background.
  const onAccentText = readableOn(tokens.accent);
  switch (body.type) {
    case 'text':
      return <Text style={isMine ? { color: onAccentText } : undefined}>{body.text}</Text>;
    case 'block': {
      // "Answering any UIBlock collapses it into the answer bubble" (G2 scope) — keyed so Reanimated
      // treats the pending -> answered swap as a mount transition (crossfade) rather than an in-place
      // prop change, with `layout` smoothing the card's height change as it shrinks to the answer line.
      return (
        <Animated.View key={body.answeredWith ? 'answered' : 'pending'} layout={reducedMotion ? undefined : LinearTransition.duration(tokens.durations.base)} entering={reducedMotion ? undefined : FadeIn.duration(tokens.durations.base)}>
          {body.answeredWith ? <AnsweredBlock block={body.block} answer={body.answeredWith} /> : <Block block={body.block} onAnswer={onAnswerBlock} />}
        </Animated.View>
      );
    }
    case 'answer':
      return (
        <Bubble mine={isMine}>
          <Text style={isMine ? { color: onAccentText } : undefined}>{body.label}</Text>
        </Bubble>
      );
    case 'card':
      return <ResultCard card={body.card} onRespondRequest={onRespondRequest} onAnswerNotification={onAnswerNotification} notification={notification} />;
    case 'image':
      return <Image source={{ uri: `/_storage/${body.storageId}` }} accessibilityLabel={body.caption ?? 'Shared photo'} style={{ width: 220, height: 220, borderRadius: 12 }} />;
    case 'notice':
      return (
        <Text variant="caption" color="muted" style={{ fontStyle: 'italic' }}>
          {body.text}
        </Text>
      );
  }
}
