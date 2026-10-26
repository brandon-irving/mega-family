// G3 "Push registration" + "Answer path" + "Tap a notification" (CONTRACT §5/§6). Two hooks, both
// no-ops on web (push.ts's own guards): `usePushRegistration` asks for permission and keeps
// `push.register` current; `useNotificationRouting` turns a tap into either a deep-link navigation or
// an answer mutation, for the foreground/background listener, a cold start, and anything the killed-app
// background task queued (pendingAnswers.ts). `usePushNotifications` is the one export screens call.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { answerGuard } from '@/services/answerGuard';
import { drainPendingAnswers } from '@/services/pendingAnswers';
import { configureForegroundNotificationHandler, registerAndroidChannels, registerNotificationCategories, requestPushRegistration, subscribeToPushTokenChanges } from '@/services/push';
import { interpretNotificationResponse, type NotificationResponseLike } from '@/services/notificationResponse';
import { showAnswerReply } from '@/services/notificationReply';
import { api } from './api';

/** Registration (categories, channels and the foreground handler) is process-global state in the native
 * SDK — redoing it on every remount (e.g. switching tabs) is harmless but pointless, so one module-level
 * flag keeps it to once per app launch regardless of how many components call the hook. */
let startedOnce = false;

/** CONTRACT §5 + G3 scope: "permission prompt at a sensible moment (not cold launch for kids before
 * they've joined)". Callers only invoke this once `viewer` is a real, joined member (AuthGate's
 * `inFamily` state) — never from the welcome/invite/onboarding screens — so the OS prompt appears the
 * first time someone actually lands in their own chat, not before. */
export function usePushRegistration(): void {
  const registerToken = useMutation(api.push.register);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;

    if (!startedOnce) {
      startedOnce = true;
      void registerNotificationCategories();
      void registerAndroidChannels();
      configureForegroundNotificationHandler();
    }

    void requestPushRegistration().then((registration) => {
      if (!cancelled && registration) void registerToken(registration);
    });

    const subscription = subscribeToPushTokenChanges((registration) => {
      void registerToken(registration);
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
    // registerToken is a fresh useMutation-bound function identity every render; only re-running this
    // effect on an actual remount (not every render) is the point — see useAnswerBlock/useSendMessage
    // in useChat.ts for the same "call it once, not every render" shape elsewhere in this data layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** CONTRACT §5 "Answer path" / §6 "Tapping the notification", plus the killed-app queue
 * (pendingAnswers.ts). Mirrors the Expo Router pattern from the current expo-notifications docs
 * (`getLastNotificationResponse()` on mount for a cold start, `addNotificationResponseReceivedListener`
 * for foreground/background) but resolves to either a deep-link `router.push` or a
 * `notifications.answer` mutation instead of always navigating, and de-dupes through `answerGuard` so a
 * response that fires from both the cold-start check and the listener only answers once. */
export function useNotificationRouting(): void {
  const answerNotification = useMutation(api.notifications.answer);
  const answerRef = useRef(answerNotification);
  // Same "latest closure, not a fresh ref write during render" pattern as MessageList.tsx's
  // useRowCallback — the React Compiler rejects mutating a ref in the render phase outright;
  // useLayoutEffect commits before the next paint/interaction, so the listener below always calls
  // through to the current mutation function without needing it in its own dependency array.
  useLayoutEffect(() => {
    answerRef.current = answerNotification;
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // `originalIdentifier`/`threadIdentifier` are only known for a *live* tap (from the response itself);
    // a queue-drained answer (the app relaunching after being killed) omits them, since the app is
    // already open again by then — PLAN §6's "lock screen shows the reply" doesn't apply once there's no
    // lock screen notification left to replace. See src/services/notificationReply.ts.
    const sendAnswer = async (notificationId: string, buttonId: string, originalIdentifier?: string, threadIdentifier?: string | null) => {
      if (!answerGuard.shouldSend(notificationId, buttonId)) return;
      answerGuard.markSent(notificationId, buttonId);
      try {
        const result = await answerRef.current({ notificationId: notificationId as Id<'notifications'>, buttonId, via: 'push' });
        if (originalIdentifier) void showAnswerReply({ identifier: originalIdentifier, threadIdentifier }, result.reply);
      } catch (e) {
        answerGuard.forget(notificationId, buttonId); // let a genuine failure (not a duplicate) retry later
        throw e;
      }
    };

    const handleResponse = (response: NotificationResponseLike) => {
      const action = interpretNotificationResponse(response);
      if (action.type === 'open') router.push(action.path as never);
      else if (action.type === 'answer') void sendAnswer(action.notificationId, action.buttonId, action.originalIdentifier, action.threadIdentifier);
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) handleResponse(lastResponse);

    // Anything the background task queued while the app was killed (pendingAnswers.ts) — drained now
    // that there's a real, authenticated mutation to call.
    void drainPendingAnswers(sendAnswer);

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, []);
}

export function usePushNotifications(): void {
  usePushRegistration();
  useNotificationRouting();
}
