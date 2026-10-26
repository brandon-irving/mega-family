// Read-only view of a kid's thread for a parent (family.kidThread) — PLAN §4. Shares MessageList with
// ChatThread (DRY: same newest-first-page -> inverted-FlatList rendering, see its docstring), with every
// callback a no-op since parents can read but never answer on the kid's behalf. "Mine" here means any
// member-authored message — a kid's thread has exactly one member in it (the kid being read).
import { MessageList, type MessageDoc } from '@/features/chat/MessageList';
import type { MegaInfo } from '@/features/shell/megaInfo';

export function KidThreadView({ messages, megaById }: { messages: MessageDoc[]; megaById: Record<string, MegaInfo> }) {
  return <MessageList messages={messages} isMine={(m) => m.author.kind === 'member'} megaById={megaById} />;
}
