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
// the top of src/app/_layout.tsx.
//
// CONTRACT §5 v0.10 (pending approval): the task has no mounted React tree and no restored Better Auth
// session (that's wired through DataProvider, which never mounts here), so it can't call the
// authenticated `notifications.answer` mutation itself — it POSTs straight to the backend's
// token-authenticated `<CONVEX_SITE_URL>/push/answer` instead (CONTRACT §5), which needs no session.
// `answerToken` is read once into a local variable for that one request and is never logged — not even
// in a catch block, which deliberately stays silent — and it's never written to the durable queue below
// (pendingAnswers.ts only ever stores notificationId+buttonId), so there's nothing of it left to delete
// once the request using it completes either way. If the request fails (offline, the route not deployed
// yet, …) or no token/site-URL is available at all, the tap falls back to that queue, which
// src/data/usePush.ts drains through the normal, authenticated mutation next launch — slightly delayed
// instead of silently dropped, but without PLAN §6's "lock screen shows the reply" for that one case
// (there's no app open yet to show it from).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { CONVEX_SITE_URL } from './convexConfig';
import { enqueuePendingAnswer } from './pendingAnswers';
import { showAnswerReply, type OriginalNotification } from './notificationReply';

export const BACKGROUND_NOTIFICATION_TASK = 'MEGA_BACKGROUND_NOTIFICATION_TASK';

type ActionResponsePayload = {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: unknown; threadIdentifier?: string | null } } };
};

function isActionResponse(data: unknown): data is ActionResponsePayload {
  return typeof data === 'object' && data !== null && 'actionIdentifier' in data;
}

type ParsedPush = { notificationId: string; answerToken?: string };

function parsePushPayload(data: unknown): ParsedPush | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.notificationId !== 'string') return null;
  return { notificationId: d.notificationId, answerToken: typeof d.answerToken === 'string' ? d.answerToken : undefined };
}

/** The task's actual decision logic, exported so tests can exercise it directly —
 * `TaskManager.defineTask`'s registration isn't something Jest can trigger. */
export async function handleBackgroundNotificationResponse(data: unknown): Promise<void> {
  if (!isActionResponse(data)) return; // a bare data-only push, not an action tap — nothing to record
  if (data.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return; // a plain tap opens the app, which fires the normal listener instead

  const push = parsePushPayload(data.notification.request.content.data);
  if (!push) return;

  const buttonId = data.actionIdentifier;
  const original: OriginalNotification = { identifier: data.notification.request.identifier, threadIdentifier: data.notification.request.content.threadIdentifier };

  if (push.answerToken && CONVEX_SITE_URL) {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/push/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: push.notificationId, buttonId, answerToken: push.answerToken }),
      });
      if (response.ok) {
        const body = (await response.json()) as { reply: string };
        await showAnswerReply(original, body.reply);
        return; // answered — nothing left to queue
      }
      // A non-OK response (e.g. an already-invalidated token) is a generic error per CONTRACT §5 — fall
      // through to the queue rather than retry here, same as a network failure.
    } catch {
      // Offline, DNS failure, the route not deployed yet, … — fall through to the durable queue below.
    }
  }

  await enqueuePendingAnswer(push.notificationId, buttonId, Date.now());
}

// Web has no expo-task-manager/expo-notifications background task support at all (both are no-ops
// there); Expo Go can't register one either (TaskManager.defineTask requires the dev-client/standalone
// native module) — both are wrapped defensively so a missing native module never crashes app startup.
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
      if (error || !data) return;
      await handleBackgroundNotificationResponse(data);
    });
    void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch {
    // Expo Go, or a platform/build without the native module yet — push still works for foreground/
    // background (not killed) via the normal response listener in src/data/usePush.ts.
  }
}
