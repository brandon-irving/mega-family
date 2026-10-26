// G3 scope, "APP KILLED" research (checked against the versioned expo-notifications/expo-task-manager
// SDK 58 docs, not memory — AGENTS.md): a category action with `opensAppToForeground: false` (required
// by CONTRACT §5, so answering a lock-screen button never opens the app) means the ordinary
// `addNotificationResponseReceivedListener` is **not** guaranteed to fire once the app has been killed —
// expo-notifications' own docs say so explicitly. The documented fallback is a background task defined
// with `expo-task-manager` and registered with `Notifications.registerTaskAsync`; on Android it also
// runs for a notification *action* tap while the app is backgrounded or terminated (their docs name this
// as Android-only — iOS has no equivalent for a truly killed app, which is this feature's ceiling on
// iOS, not a bug here).
//
// Per the docs, the task must be defined and registered in the module scope of a file loaded early
// (their own example uses `index.ts`); this file is imported for its side effect only, first thing, at
// the top of src/app/_layout.tsx. It cannot safely call the authenticated `notifications.answer`
// mutation itself (see pendingAnswers.ts's docstring for why) — it only durably records the tap, which
// usePush.ts's foreground drain turns into the real call.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { enqueuePendingAnswer } from './pendingAnswers';

export const BACKGROUND_NOTIFICATION_TASK = 'MEGA_BACKGROUND_NOTIFICATION_TASK';

function isActionResponse(data: unknown): data is { actionIdentifier: string; notification: { request: { content: { data: unknown } } } } {
  return typeof data === 'object' && data !== null && 'actionIdentifier' in data;
}

function pushNotificationId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const id = (data as Record<string, unknown>).notificationId;
  return typeof id === 'string' ? id : null;
}

// Web has no expo-task-manager/expo-notifications background task support at all (both are no-ops
// there); Expo Go can't register one either (TaskManager.defineTask requires the dev-client/standalone
// native module) — both are wrapped defensively so a missing native module never crashes app startup.
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
      if (error || !data || !isActionResponse(data)) return; // a bare data-only push, not an action tap — nothing to record
      if (data.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return; // a plain tap opens the app anyway, which fires the normal listener
      const notificationId = pushNotificationId(data.notification.request.content.data);
      if (!notificationId) return;
      await enqueuePendingAnswer(notificationId, data.actionIdentifier, Date.now());
    });
    void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch {
    // Expo Go, or a platform/build without the native module yet — push still works for foreground/
    // background (not killed) via the normal response listener in src/data/usePush.ts.
  }
}
