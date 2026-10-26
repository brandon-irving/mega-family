// Read-only view of a kid's thread for a parent (family.kidThread) — PLAN §4. Shares MessageList with
// ChatThread (DRY: same newest-first-page -> inverted-FlatList rendering, see its docstring), with every
// callback a no-op since parents can read but never answer on the kid's behalf. "Mine" here means any
// member-authored message — a kid's thread has exactly one member in it (the kid being read).
import { MessageList, type MessageDoc } from '@/features/chat/MessageList';
import type { MegaInfo } from '@/features/shell/megaInfo';

// Module-scope (not defined inside the component): doesn't close over any props, so this is the same
// function reference on every render — MessageList's renderItem useCallback relies on `isMine` being
// referentially stable (G2 fix item 4; see MessageList.tsx's docstring).
const isMine = (m: MessageDoc) => m.author.kind === 'member';

export function KidThreadView({ messages, megaById }: { messages: MessageDoc[]; megaById: Record<string, MegaInfo> }) {
  // A parent reading is never editing: save chips here are always read-only, regardless of the kid's
  // own role-based chip setting (PLAN §4: "reading isn't recall" — scope changes stay the kid's own call).
  return <MessageList messages={messages} isMine={isMine} megaById={megaById} chipsReadOnly />;
}
