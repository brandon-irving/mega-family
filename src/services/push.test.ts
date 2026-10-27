// G3 review fix (HIGH, "iOS force-quit answers"): `registerNotificationCategories` reads
// `PUSH_CONFIG.iosActionsOpenApp` (shared/config/notifications.ts) — the owner's escape valve if a
// real-device test shows iOS doesn't run this app's JS for a killed-app action tap. Checks the config
// edit actually changes what gets registered, on iOS only, never on Android (whose killed-app coverage
// is the `expo-task-manager` background task, which needs `opensAppToForeground: false` to run at all).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerNotificationCategories } from './push';

jest.mock('@shared/config/notifications', () => {
  const actual = jest.requireActual('@shared/config/notifications');
  return { ...actual, PUSH_CONFIG: { iosActionsOpenApp: true } };
});

// `expo-notifications`' named exports aren't writable/configurable in this test environment (jest-expo's
// own module shape), so `jest.spyOn` on the namespace throws "Cannot redefine property" — mocking the
// whole module (keeping its real enums/constants via requireActual) is the documented workaround.
jest.mock('expo-notifications', () => ({ ...jest.requireActual('expo-notifications'), setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined) }));

const mockSetCategory = Notifications.setNotificationCategoryAsync as jest.Mock;

function withPlatform<T>(os: 'ios' | 'android', fn: () => T): T {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
}

describe('registerNotificationCategories', () => {
  beforeEach(() => {
    mockSetCategory.mockClear();
  });

  test('PUSH_CONFIG.iosActionsOpenApp: true registers iOS categories with opensAppToForeground true', async () => {
    await withPlatform('ios', () => registerNotificationCategories());
    expect(mockSetCategory).toHaveBeenCalled();
    for (const [, actions] of mockSetCategory.mock.calls) {
      for (const action of actions as { options: { opensAppToForeground: boolean } }[]) {
        expect(action.options.opensAppToForeground).toBe(true);
      }
    }
  });

  test('the same flag never flips Android — its killed-app path needs opensAppToForeground false to run', async () => {
    await withPlatform('android', () => registerNotificationCategories());
    expect(mockSetCategory).toHaveBeenCalled();
    for (const [, actions] of mockSetCategory.mock.calls) {
      for (const action of actions as { options: { opensAppToForeground: boolean } }[]) {
        expect(action.options.opensAppToForeground).toBe(false);
      }
    }
  });
});
