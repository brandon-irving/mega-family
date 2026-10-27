// G3 scope: "Foreground behavior: a push arriving while that chat is open should not double-show
// (setNotificationHandler decides)." There's one thread per member (CONTRACT decisions), so "that chat"
// reduces to "is the chat screen focused at all" — the chat route's `useFocusEffect` (src/app/(tabs)/chat/
// index.tsx) toggles this; src/services/push.ts's `setNotificationHandler` callback reads it synchronously
// (it has no React tree of its own to read context from, and must resolve within 3s per the SDK docs).
let chatFocused = false;

export function setChatFocused(focused: boolean): void {
  chatFocused = focused;
}

export function isChatFocused(): boolean {
  return chatFocused;
}
