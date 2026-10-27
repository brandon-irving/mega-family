// G3 review fix (HIGH, "iOS force-quit answers"): a trivial module but load-bearing — a typo here
// would silently make backgroundNotificationTask.ts's module-scope iOS listener always defer (dropping
// killed-app taps) or never defer (always bypassing the authenticated path).
import { isNotificationListenerMounted, setNotificationListenerMounted } from './notificationListenerState';

describe('notificationListenerState', () => {
  test('starts unmounted, reflects whatever was last set', () => {
    expect(isNotificationListenerMounted()).toBe(false);
    setNotificationListenerMounted(true);
    expect(isNotificationListenerMounted()).toBe(true);
    setNotificationListenerMounted(false);
    expect(isNotificationListenerMounted()).toBe(false);
  });
});
