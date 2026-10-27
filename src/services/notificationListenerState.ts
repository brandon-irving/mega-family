// G3 review fix (HIGH, "iOS force-quit answers"): a plain module-level flag, not React state — it has
// to be readable from src/services/backgroundNotificationTask.ts's MODULE-SCOPE response handling,
// which runs before (and independently of) any component mounting, so a context/hook can't carry it.
//
// `true` exactly while src/data/usePush.ts's `useNotificationRouting` is mounted — i.e. there's a real,
// signed-in member with its own `addNotificationResponseReceivedListener` subscription already live,
// answering through the authenticated `notifications.answer` mutation. That hook only mounts once
// AuthGate resolves to `inFamily` *and* the chat screen itself has mounted (usePushNotifications() is
// called from src/app/(tabs)/chat/index.tsx), so this is a closer signal than "is someone signed in" —
// it's specifically "is there already a listener that will handle this tap the normal way," which is
// the exact condition backgroundNotificationTask.ts's module-scope listener needs to defer to it instead
// of answering through the unauthenticated `POST /push/answer` token route.
let listenerMounted = false;

export function setNotificationListenerMounted(value: boolean): void {
  listenerMounted = value;
}

export function isNotificationListenerMounted(): boolean {
  return listenerMounted;
}
