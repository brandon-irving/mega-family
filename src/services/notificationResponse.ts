// Turns a raw expo-notifications response (or a cold-start "last response") into one of three actions
// CONTRACT §5/§6 describe: a button tap answers the notification (`notifications.answer`), the default
// tap opens the recipient's chat at that message (deep link + "From a notification" notice), or — a
// dismiss / malformed payload — nothing happens. Pure and native-import-light (only the one string
// constant expo-notifications exports for "this was a plain tap, not a button") so it's unit-testable
// without a real device, and shared by the foreground/background listener and the cold-start check.
import { DEFAULT_ACTION_IDENTIFIER } from 'expo-notifications';
import { LINKS } from '@shared/domain/api';
import { toPath } from '@/features/shell/links';
import type { PushData } from '@shared/domain/api';

/** Structurally what both `addNotificationResponseReceivedListener` and `getLastNotificationResponse`
 * hand back — typed loosely (not the full expo-notifications `NotificationResponse`) so tests can build
 * one with a plain object instead of constructing a real native response. */
export type NotificationResponseLike = {
  actionIdentifier: string;
  notification: { request: { content: { data?: unknown } } };
};

export type ResponseAction = { type: 'answer'; notificationId: PushData['notificationId']; buttonId: string } | { type: 'open'; path: string } | { type: 'ignore' };

/** CONTRACT §5's push payload `data` shape, checked by hand (not `shared/domain`'s Convex validator,
 * which isn't meant for client-side `unknown` parsing) — a malformed or foreign payload is ignored
 * rather than crashing the response listener. */
function parsePushData(data: unknown): PushData | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || typeof d.notificationId !== 'string' || typeof d.threadId !== 'string' || typeof d.messageId !== 'string' || typeof d.kind !== 'string') return null;
  return d as unknown as PushData;
}

export function interpretNotificationResponse(response: NotificationResponseLike): ResponseAction {
  const data = parsePushData(response.notification.request.content.data);
  if (!data) return { type: 'ignore' };

  if (response.actionIdentifier === DEFAULT_ACTION_IDENTIFIER) {
    // CONTRACT §6: "mega://chat/<messageId> (scrolls to the message, adds a notice)".
    return { type: 'open', path: toPath(LINKS.chatMessage(data.messageId)) };
  }

  // expo-notifications' own dismiss identifier isn't exported as a constant the same way
  // DEFAULT_ACTION_IDENTIFIER is (`UNKNOWN`/dismiss responses carry a platform-specific string on
  // Android and never fire the listener at all on iOS unless `customDismissAction` is set, which this
  // app's categories don't set) — anything that isn't the default tap and isn't one of this family's
  // configured button ids is treated as a no-op rather than guessed at.
  return { type: 'answer', notificationId: data.notificationId, buttonId: response.actionIdentifier };
}
