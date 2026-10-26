// Read-only view of a kid's thread for a parent (family.kidThread) — PLAN §4. Reuses MessageRow with
// every callback a no-op, since parents can read but never answer on the kid's behalf.
import { FlatList } from 'react-native';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { MessageRow, type MessageDoc } from '@/features/chat/MessageRow';

const noop = () => {};

export function KidThreadView({ messages, megaById }: { messages: MessageDoc[]; megaById: Record<string, MegaInfo> }) {
  const tokens = useTokens();
  if (messages.length === 0) return <Text color="muted">No messages yet.</Text>;
  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => m._id}
      contentContainerStyle={{ gap: tokens.spacing.sm }}
      renderItem={({ item }) => (
        <MessageRow
          message={item}
          isMine={item.author.kind === 'member'}
          mega={item.author.kind === 'mega' ? megaById[item.author.id] ?? null : null}
          onAnswerBlock={noop}
          onReact={noop}
          onChangeMemoryScope={noop}
          onForgetMemory={noop}
        />
      )}
    />
  );
}
