// PLAN §6: "answering doesn't open the app, and the lock screen shows the MEGA's reply" — shared by
// both answer paths (the foreground/background response listener via `notifications.answer`, and the
// killed-app background task via the `push/answer` HTTP route) so the lock screen behaves identically
// either way (DRY, per the G3 follow-up). Scheduling a local notification with the *same* `identifier`
// as the one being answered replaces it in place (expo-notifications' documented
// `scheduleNotificationAsync` behavior) instead of stacking a second notification next to it.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type OriginalNotification = { identifier: string; threadIdentifier?: string | null };

export async function showAnswerReply(original: OriginalNotification, reply: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: original.identifier,
      content: {
        body: reply,
        ...(original.threadIdentifier ? { threadIdentifier: original.threadIdentifier } : {}),
      },
      trigger: null, // present immediately — this *is* the delivered reply, not a future reminder
    });
  } catch {
    // Best-effort: the answer itself already succeeded (the mutation/HTTP call returned the reply);
    // failing to update the lock screen's notification isn't worth surfacing as an error.
  }
}
