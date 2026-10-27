// CONTRACT §5 / PLAN.md decision 4: "A set lives entirely in shared/config/buttonSets... The app
// registers notification categories from that config at startup." These derivations are the single
// place that turns BUTTON_SETS/ANDROID_CHANNELS into expo-notifications' native shapes — a changed
// button label or a new button set shows up here without touching src/services/push.ts at all.
import { BUTTON_SETS } from '@shared/config/notifications';
import { androidChannelsFromConfig, notificationCategoriesFromConfig } from './notificationConfig';

describe('notificationCategoriesFromConfig', () => {
  test('one category per non-empty button set, in config order, opensAppToForeground false on every action', () => {
    const categories = notificationCategoriesFromConfig();
    expect(categories.map((c) => c.identifier)).toEqual(['reminder.default', 'request.default']);
    for (const category of categories) {
      for (const action of category.actions) {
        expect(action.options.opensAppToForeground).toBe(false);
      }
    }
  });

  test('skips button sets with no buttons (tip.default, update.default)', () => {
    const categories = notificationCategoriesFromConfig();
    expect(categories.find((c) => c.identifier === 'tip.default')).toBeUndefined();
    expect(categories.find((c) => c.identifier === 'update.default')).toBeUndefined();
  });

  test('reminder.default carries its configured buttons in order', () => {
    const categories = notificationCategoriesFromConfig();
    const reminder = categories.find((c) => c.identifier === 'reminder.default')!;
    expect(reminder.actions).toEqual(BUTTON_SETS['reminder.default'].map((b) => ({ identifier: b.id, buttonTitle: b.label, options: { opensAppToForeground: false } })));
  });

  test('adding a button to config shows up here with no other code change (single source of truth)', () => {
    // Guards the "config edit, not a code edit" rule: this test only reads BUTTON_SETS, so a future
    // button added to shared/config/notifications.ts is reflected automatically.
    const categories = notificationCategoriesFromConfig();
    const request = categories.find((c) => c.identifier === 'request.default')!;
    expect(request.actions).toHaveLength(BUTTON_SETS['request.default'].length);
  });
});

describe('androidChannelsFromConfig', () => {
  test('loud channel is high importance, quiet channel is low', () => {
    const channels = androidChannelsFromConfig();
    expect(channels).toEqual([
      { channelId: 'mega.loud', name: 'Reminders and requests', importance: 'high' },
      { channelId: 'mega.quiet', name: 'Tips and updates', importance: 'low' },
    ]);
  });
});
