// Derives expo-notifications' native registration shapes (categories, Android channels) from the one
// config source (shared/config/notifications.ts BUTTON_SETS / ANDROID_CHANNELS) — CONTRACT §5: "the app
// registers notification categories from that config at startup, and answers are handled by button id."
// Kept free of any expo-notifications import so it's plain-data testable under Jest without touching the
// native module; src/services/push.ts is the only file that feeds this into the real SDK calls.
import { ANDROID_CHANNELS, BUTTON_SETS } from '@shared/config/notifications';
import { BUTTON_SET_IDS } from '@shared/config/ids';

// `opensAppToForeground: false` nests under each action's own `options` (not a top-level field) —
// expo-notifications' `NotificationAction.options.opensAppToForeground`. Per its own docs: "If `false`
// and your app is killed (not just backgrounded), NotificationResponseReceived listeners will not be
// triggered when a user selects this action" — exactly why answers also need the background task +
// pending-answer queue (src/services/backgroundNotificationTask.ts, src/services/pendingAnswers.ts).
export type CategoryAction = { identifier: string; buttonTitle: string; options: { opensAppToForeground: false } };
export type NotificationCategorySpec = { identifier: string; actions: CategoryAction[] };

/** One category per button set that actually has buttons (`tip.default`/`update.default` are empty —
 * CONTRACT §5 — registering a category with zero actions would be a no-op gesture, not a real category). */
export function notificationCategoriesFromConfig(): NotificationCategorySpec[] {
  return BUTTON_SET_IDS.filter((id) => BUTTON_SETS[id].length > 0).map((id) => ({
    identifier: id,
    actions: BUTTON_SETS[id].map((b) => ({ identifier: b.id, buttonTitle: b.label, options: { opensAppToForeground: false as const } })),
  }));
}

export type AndroidChannelImportance = 'high' | 'low';
export type AndroidChannelSpec = { channelId: string; name: string; importance: AndroidChannelImportance };

/** CONTRACT §5: "Android channels `mega.loud` and `mega.quiet` (ids in config)." Loud -> HIGH importance
 * (heads-up, sound), quiet -> LOW (silent, no heads-up) — PLAN §6 "Tips and kid updates arrive silently". */
export function androidChannelsFromConfig(): AndroidChannelSpec[] {
  return [
    { channelId: ANDROID_CHANNELS.loud, name: 'Reminders and requests', importance: 'high' },
    { channelId: ANDROID_CHANNELS.quiet, name: 'Tips and updates', importance: 'low' },
  ];
}
