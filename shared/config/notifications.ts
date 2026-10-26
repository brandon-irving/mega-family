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
