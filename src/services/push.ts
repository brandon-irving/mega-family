// The one file that imports expo-notifications for registration/token concerns (src/services/
// backgroundNotificationTask.ts and src/services/notificationResponse.ts are the other two, for the
// background task and response parsing respectively) — feature code calls this adapter, never the SDK
// directly, per the "config and adapter driven" rule. Categories/channels come from
// src/services/notificationConfig.ts (itself derived from shared/config/notifications.ts), so a new
// button or a relabeled one is a config edit here too.
//
// Web guard (G3 scope: "Web: push isn't supported the same way — degrade gracefully"): every exported
// function no-ops (or returns null) on `Platform.OS === 'web'` instead of touching expo-notifications,
// which has no web push implementation worth prompting for.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
// Named imports (not `Notifications.AndroidImportance`/`.IosAuthorizationStatus`/`.PermissionStatus`)
// for the enums specifically: eslint's `import/namespace` resolver doesn't see TS `enum`/re-exported
// members through a `* as` namespace import for this package, even though they're real runtime exports
// (confirmed against node_modules/expo-notifications' own build output) — a false positive this sidesteps.
import { AndroidImportance, IosAuthorizationStatus, PermissionStatus } from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import { IDENTITY } from '@shared/config/identity';
import type { Platform as PlatformEnum } from '@shared/domain/enums';
import { androidChannelsFromConfig, notificationCategoriesFromConfig } from './notificationConfig';
import { isChatFocused } from './chatFocus';

const IMPORTANCE: Record<'high' | 'low', AndroidImportance> = {
  high: AndroidImportance.HIGH,
  low: AndroidImportance.LOW,
};

/** CONTRACT §5: categories registered from BUTTON_SETS at startup, `opensAppToForeground: false`. Safe
 * to call every launch — `setNotificationCategoryAsync` upserts by identifier. */
export async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const category of notificationCategoriesFromConfig()) {
    await Notifications.setNotificationCategoryAsync(category.identifier, category.actions);
  }
}

/** CONTRACT §5: "Android channels mega.loud and mega.quiet." A no-op on iOS/web (expo-notifications
 * itself no-ops there too; the explicit guard just skips the pointless native call). */
export async function registerAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const channel of androidChannelsFromConfig()) {
    await Notifications.setNotificationChannelAsync(channel.channelId, { name: channel.name, importance: IMPORTANCE[channel.importance] });
  }
}

/** G3 scope: "Foreground behavior: a push arriving while that chat is open should not double-show." The
 * handler must resolve within 3s and can't read React context, so it reads the module-level flag
 * chatFocus.ts's chat route toggles. Badge stays accurate either way; the banner/list entry (which would
 * duplicate what the open thread already shows) is suppressed only while that screen is focused. */
export function configureForegroundNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const suppress = isChatFocused();
      return { shouldShowBanner: !suppress, shouldShowList: !suppress, shouldPlaySound: false, shouldSetBadge: true };
    },
  });
}

export type PushRegistration = { token: string; platform: PlatformEnum };

/** Requests permission (if not already decided) and returns the Expo push token to send to
 * `push.register`. Returns `null` on web, in a simulator/unsupported environment, or if the person
 * declines the prompt — every caller must treat that as "push isn't available right now", not an error. */
export async function requestPushRegistration(): Promise<PushRegistration | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null; // web, or an unexpected RN platform
  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted || existing.ios?.status === IosAuthorizationStatus.PROVISIONAL;
    if (!granted && existing.status !== PermissionStatus.DENIED) {
      const requested = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
      granted = requested.granted;
    }
    if (!granted) return null;
    const expoPushToken = await Notifications.getExpoPushTokenAsync({ projectId: IDENTITY.easProjectId });
    return { token: expoPushToken.data, platform: Platform.OS };
  } catch {
    // Offline, a simulator without push entitlements, or a missing/placeholder EAS project id in dev —
    // none of those should block the rest of the app from working.
    return null;
  }
}

/** CONTRACT §5 / G3 scope: "re-register on token change." expo-notifications' own token-rotation docs:
 * the listener fires with the raw device token, not the Expo push token — re-deriving the Expo token is
 * the documented way to get the value `push.register` actually expects. */
export function subscribeToPushTokenChanges(onNewToken: (registration: PushRegistration) => void): EventSubscription | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  return Notifications.addPushTokenListener(() => {
    void Notifications.getExpoPushTokenAsync({ projectId: IDENTITY.easProjectId })
      .then((fresh) => onNewToken({ token: fresh.data, platform: Platform.OS as PlatformEnum }))
      .catch(() => {});
  });
}
