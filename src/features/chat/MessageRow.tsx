// Renders one thread message of any MessageBody type (CONTRACT §3): text, block, answer, card,
// image, notice. MEGA and system messages render without a bubble (a MegaBadge sits beside them,
// PLAN §1); only the viewer's own messages are bubbles.
import { Image, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { messageDoc } from '@shared/domain/api';
import type { BlockAnswer } from '@shared/domain/messages';
import type { Reaction, Scope } from '@shared/domain/enums';
import { Bubble } from '@/ui/Bubble';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
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
  notificationButtons?: { id: string; label: string }[];
};

export function MessageRow({
  message,
  isMine,
  mega,
  onAnswerBlock,
  onChangeMemoryScope,
  onForgetMemory,
  onRespondRequest,
  onAnswerNotification,
  notificationButtons,
}: MessageRowProps) {
  const tokens = useTokens();
  const showBadge = message.author.kind === 'mega';
  const content = <Body message={message} isMine={isMine} onAnswerBlock={onAnswerBlock} onRespondRequest={onRespondRequest} onAnswerNotification={onAnswerNotification} notificationButtons={notificationButtons} />;

  return (
    <View style={{ marginBottom: tokens.spacing.md }}>
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
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Body({
  message,
  isMine,
  onAnswerBlock,
  onRespondRequest,
  onAnswerNotification,
  notificationButtons,
}: {
  message: MessageDoc;
  isMine: boolean;
  onAnswerBlock: (answer: BlockAnswer) => void;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  notificationButtons?: { id: string; label: string }[];
}) {
  const body = message.body;
  switch (body.type) {
    case 'text':
      return <Text style={isMine ? { color: '#FFFFFF' } : undefined}>{body.text}</Text>;
    case 'block':
      return body.answeredWith ? <AnsweredBlock block={body.block} answer={body.answeredWith} /> : <Block block={body.block} onAnswer={onAnswerBlock} />;
    case 'answer':
      return (
        <Bubble mine={isMine}>
          <Text style={isMine ? { color: '#FFFFFF' } : undefined}>{body.label}</Text>
        </Bubble>
      );
    case 'card':
      return <ResultCard card={body.card} onRespondRequest={onRespondRequest} onAnswerNotification={onAnswerNotification} notificationButtons={notificationButtons} />;
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
