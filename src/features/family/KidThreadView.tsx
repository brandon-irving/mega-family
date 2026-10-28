// Read-only view of a kid's thread for a parent (family.kidThread) — PLAN §4. Shares MessageList with
// ChatThread (DRY: same newest-first-page -> inverted-FlatList rendering, see its docstring), with every
// callback a no-op since parents can read but never answer on the kid's behalf. "Mine" here means any
// member-authored message — a kid's thread has exactly one member in it (the kid being read).
// G4 UX review (Oct 28): while the transcript loads it shows the walking-MEGA loader (never "No messages
// yet."), and the newest message keeps clear of the tab bar.
import { View } from 'react-native';
import { MessageList, type MessageDoc } from '@/features/chat/MessageList';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { MegaLoader } from '@/features/walkers';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { CHAT_COPY, fillCopy } from '@shared/config/copy';

// Module-scope (not defined inside the component): doesn't close over any props, so this is the same
// function reference on every render — MessageList's renderItem useCallback relies on `isMine` being
// referentially stable (G2 fix item 4; see MessageList.tsx's docstring).
const isMine = (m: MessageDoc) => m.author.kind === 'member';

/** Room under the newest message so it never sits flush against the tab bar. */
const TAB_BAR_CLEARANCE = 56;

export function KidThreadView({ messages, megaById, loading = false, kidName }: { messages: MessageDoc[]; megaById: Record<string, MegaInfo>; loading?: boolean; kidName: string }) {
  const tokens = useTokens();
  const empty = loading ? (
    <View style={{ height: 240 }}>
      <MegaLoader text={CHAT_COPY.kidThreadOpening} testID="kid-thread-loading" />
    </View>
  ) : (
    <View style={{ padding: tokens.spacing.xl, alignItems: 'center' }}>
      <Text color="muted">{fillCopy(CHAT_COPY.kidThreadEmpty, { name: kidName })}</Text>
    </View>
  );
  // A parent reading is never editing: save chips here are always read-only, regardless of the kid's
  // own role-based chip setting (PLAN §4: "reading isn't recall" — scope changes stay the kid's own call).
  return <MessageList messages={messages} isMine={isMine} megaById={megaById} chipsReadOnly emptyContent={empty} endPadding={TAB_BAR_CLEARANCE} />;
}
