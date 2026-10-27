// Notification kinds, how loud each is, its button set and judge thresholds. Changing a button set is a config edit:
// the app registers notification categories from BUTTON_SETS at startup and answers are handled by button id.
import type { Loudness, NotificationKind } from '../domain/enums';
import type { BUTTON_SET_IDS } from './ids';

export const BUTTON_SETS = {
  'reminder.default': [
    { id: 'on_my_way', label: 'On my way' },
    { id: 'snooze_5', label: 'Snooze 5 min' },
  ],
  'request.default': [
    { id: 'yes', label: 'Yes' },
    { id: 'cant', label: "I can't" },
  ],
  'tip.default': [],
  'update.default': [],
} as const satisfies Record<(typeof BUTTON_SET_IDS)[number], readonly { id: string; label: string }[]>;
export type ButtonSetId = keyof typeof BUTTON_SETS;

export const ANDROID_CHANNELS = { loud: 'mega.loud', quiet: 'mega.quiet' } as const;

export const NOTIFICATION_KINDS_CONFIG: Record<
  NotificationKind,
  { loudness: Loudness; buttons: ButtonSetId; channel: keyof typeof ANDROID_CHANNELS; thresholds: { push: number; widget: number }; kidsGetIt: boolean }
> = {
  reminder: { loudness: 'timeSensitive', buttons: 'reminder.default', channel: 'loud', thresholds: { push: 0.6, widget: 0.3 }, kidsGetIt: true },
  request: { loudness: 'active', buttons: 'request.default', channel: 'loud', thresholds: { push: 0.65, widget: 0.35 }, kidsGetIt: false },
  tip: { loudness: 'passive', buttons: 'tip.default', channel: 'quiet', thresholds: { push: 0.85, widget: 0.4 }, kidsGetIt: false },
  update: { loudness: 'passive', buttons: 'update.default', channel: 'quiet', thresholds: { push: 0.8, widget: 0.4 }, kidsGetIt: false },
};

/** G3 security review (S5, LOW): lock-screen redaction. `'full'` sends the notification's own body text in
 * the push payload; `'genericIfMattersTo'` sends a generic placeholder instead WHEN the candidate behind it
 * came from the cross-member "matters to" trigger (convex/model/proactive.ts `buildPushMessages`) — a
 * stranger glancing at a locked phone shouldn't see "we're out of milk, ask Coral" or whatever a family
 * member said that got relayed. The full text is never withheld from the thread itself (`notifications.get`
 * always returns the real `body`) — only the lock-screen/notification-tray copy changes. Reminders and
 * requests are always full: a reminder is the member's own; a request's "text" is written by the asking
 * member specifically to be read as a request, same posture as a text message. */
export const PUSH_BODY_REDACTION: Record<NotificationKind, 'full' | 'genericIfMattersTo'> = {
  reminder: 'full',
  request: 'full',
  tip: 'genericIfMattersTo',
  update: 'genericIfMattersTo',
};

/** The generic lock-screen body used when `PUSH_BODY_REDACTION` redacts a push (S5). Takes the MEGA's name
 * so it still feels personal ("Teal has a message for you") without revealing content. */
export function genericPushBody(megaName: string): string {
  return `${megaName} has a message for you`;
}

/** UX4: which notifications visually group together on the lock screen (checked against the CURRENT Expo
 * push docs, Oct 26 — `sending-notifications.mdx`'s field table). Expo's push message format exposes one
 * real grouping primitive: `threadId` (iOS only, maps to `aps.thread-id`; notifications sharing one stack
 * into "N quiet updates from Teal" without replacing each other). `'perMega'` groups every kind-matching
 * push from the same MEGA under one `threadId` (`mega:<megaId>`); `'none'` sends no threadId. Loud kinds
 * (reminder/request) stay ungrouped on purpose — each should stand out on its own.
 *
 * Known gap (documented, not silently skipped): Expo's push API has NO equivalent field for Android grouping
 * (no `group`/`groupSummary`/notification-channel-level grouping is exposed — only `channelId`, which just
 * selects a channel, and `tag`/`collapseId`, which replace/collapse rather than group). Getting real Android
 * stacking ("N quiet updates from Teal" as one expandable group, the way Gmail groups by thread) would need
 * a native notification extension Expo's push service doesn't provide — e.g. a config plugin that posts
 * through `NotificationCompat.Builder.setGroup`/`setGroupSummary` directly, bypassing Expo's HTTP push API
 * for Android. Not built here; Android pushes still arrive correctly, just one at a time in the tray. */
export const PUSH_GROUPING: Record<NotificationKind, 'perMega' | 'none'> = {
  reminder: 'none',
  request: 'none',
  tip: 'perMega',
  update: 'perMega',
};

export function pushThreadIdFor(kind: NotificationKind, megaId: string): string | undefined {
  return PUSH_GROUPING[kind] === 'perMega' ? `mega:${megaId}` : undefined;
}
