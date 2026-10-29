// G3 scope, "APP KILLED" research (checked against the versioned expo-notifications/expo-task-manager
// SDK 58 docs, not memory — AGENTS.md): a category action with `opensAppToForeground: false` (required
// by CONTRACT §5, so answering a lock-screen button never opens the app) means the ordinary
// `addNotificationResponseReceivedListener` is **not** guaranteed to fire once the app has been killed —
// expo-notifications' own docs say so explicitly. The documented fallback is a background task defined
// with `expo-task-manager` and registered with `Notifications.registerTaskAsync`: on Android it also
// runs for a notification *action* tap while the app is backgrounded or terminated (their docs name this
// as Android-only: "Only on Android, the task also runs in response to a notification action tap when
// the app is backgrounded or terminated").
//
// G3 REVIEW FIX (HIGH, "iOS force-quit answers"): that Android-only line describes *expo-task-manager's*
// background-task mechanism specifically, not iOS notification delivery in general — it is not the same
// claim as "iOS drops a killed-app action tap entirely," which is what this file assumed before this
// fix. Apple's UserNotifications framework document a `UNNotificationActionOptions` without `.foreground`
// (what `opensAppToForeground: false` maps to) as still delivering the response to the app's delegate —
// launching the app process in the background if it was killed — the same way a background-only remote
// notification does. Expo's own SDK 58 docs don't confirm or rule this out for actions specifically
// ("check the Apple documentation or test on a device" is their own guidance), so this is a documented
// assumption, not a certainty — `PUSH_CONFIG.iosActionsOpenApp` (shared/config/notifications.ts) is the
// escape valve if an owner's real-device test proves it wrong. Acting on the assumption: below, a second
// entry point — `addNotificationResponseReceivedListener` plus a `getLastNotificationResponse()` check,
// both registered at MODULE SCOPE, iOS only — feeds the exact same decision logic
// (`handleBackgroundNotificationResponse`) the Android TaskManager task uses (DRY: one handler, two
// platform-specific entry points), gated so it only acts when there's no mounted, signed-in session yet
// to answer through the normal, authenticated path instead (notificationListenerState.ts; see
// `registerModuleScopeIosResponseHandling` below). `answerGuard` (shared singleton) stops this path and
// the mounted listener / its own cold-start check from both answering the very same tap twice — and the
// backend's `notifications.answer`/`POST /push/answer` are idempotent regardless (CONTRACT §5), so even
// a missed de-dupe just costs a redundant round-trip, never a wrong result.
//
// Per the docs, the task must be defined and registered in the module scope of a file loaded early
// (their own example uses `index.ts`); this file is imported for its side effect only, first thing, at
// the top of src/app/_layout.tsx — so before any screen (and so before DataProvider/AuthGate) ever mounts.
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
import { answerGuard } from './answerGuard';
import { CONVEX_SITE_URL } from './convexConfig';
import { isNotificationListenerMounted } from './notificationListenerState';
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

/** Registers the task; never rejects. iOS rejects it when the build has no `remote-notification`
 * background mode (dev build cd4140e3: the plugin's `enableBackgroundRemoteNotifications` lands in the
 * post-freeze rebuild). Push still works through the mounted listener and the module-scope cold-start
 * check, so this is a dev warning, not an error. */
export async function registerBackgroundNotificationTask(): Promise<boolean> {
  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    return true;
  } catch (e) {
    console.warn(`Background notification task not registered: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
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
    void registerBackgroundNotificationTask();
  } catch {
    // Expo Go, or a platform/build without the native module yet — push still works for foreground/
    // background (not killed) via the normal response listener in src/data/usePush.ts.
  }
}

/** The iOS module-scope entry point's decision logic, exported so tests can exercise it directly (same
 * reasoning as `handleBackgroundNotificationResponse` above — there's no way to trigger a real
 * `addNotificationResponseReceivedListener` callback under Jest). Only acts on a button-action response
 * when there's no mounted, signed-in session yet to answer it the normal (authenticated) way — see this
 * file's top-of-file comment and notificationListenerState.ts. */
export async function handleModuleScopeResponseIfNoSession(data: unknown): Promise<void> {
  if (isNotificationListenerMounted()) return; // src/data/usePush.ts's mounted listener owns this tap
  if (!isActionResponse(data)) return;
  if (data.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return; // a plain tap opens the app; the normal listener/cold-start check handles navigation

  const push = parsePushPayload(data.notification.request.content.data);
  if (!push) return;
  const buttonId = data.actionIdentifier;

  if (!answerGuard.shouldSend(push.notificationId, buttonId)) return; // this exact tap is already being handled (the listener firing for the same event the startup check already consumed, or vice versa)
  answerGuard.markSent(push.notificationId, buttonId);
  try {
    await handleBackgroundNotificationResponse(data);
  } finally {
    // Forgotten unconditionally, not just on a caught error: `handleBackgroundNotificationResponse`
    // itself already falls back to the durable queue on any failure, and once a real session exists
    // later, src/data/usePush.ts's `drainPendingAnswers` must still be able to retry through the
    // *authenticated* path rather than being silently skipped by this same guard key (mirrors the
    // mounted listener's own forget-after-attempting pattern, src/data/usePush.ts's `sendAnswer`). A
    // redundant second attempt after a success here just costs an extra round-trip — CONTRACT §5's
    // answer paths are idempotent, so that's a cost, never a wrong result.
    answerGuard.forget(push.notificationId, buttonId);
  }
}

// iOS only: Android's killed-app coverage is the TaskManager background task registered above, which
// (per this file's top comment) is documented Android-only for action taps. `addNotificationResponseReceivedListener`
// registered here, at MODULE SCOPE, exists for the whole app lifetime from the moment this file is
// first imported (src/app/_layout.tsx, before any screen mounts) — so it's already subscribed if/when
// iOS relaunches the JS bundle in the background for a killed-app action tap. `getLastNotificationResponse()`
// covers the documented race where the response was already consumed before a listener could attach
// (expo-notifications' own cold-start guidance — src/data/usePush.ts does the same check once it mounts,
// as a second line of defense for whatever this one somehow missed).
if (Platform.OS === 'ios') {
  try {
    Notifications.addNotificationResponseReceivedListener((response) => {
      void handleModuleScopeResponseIfNoSession(response);
    });
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) void handleModuleScopeResponseIfNoSession(lastResponse);
  } catch {
    // Expo Go, or a platform/build without the native module yet — same defensive posture as the
    // Android TaskManager registration above.
  }
}
