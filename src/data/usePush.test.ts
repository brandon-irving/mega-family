// G3 scope: push registration, the answer path, and cold-start/foreground tap routing (CONTRACT §5/§6).
// No `jest.resetModules()` here on purpose — it would load a second copy of `react` disconnected from
// the one `@testing-library/react-native`'s `renderHook` already initialized, which crashes every hook
// call with "Cannot read properties of null (reading 'useEffect')". `usePushRegistration`'s "register
// categories/channels once" guard is therefore tested as the suite's first test (module-level state,
// not reset between tests) rather than by reloading the module.
import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { DEFAULT_ACTION_IDENTIFIER } from 'expo-notifications';
import * as push from '@/services/push';
import * as pendingAnswers from '@/services/pendingAnswers';
import * as notificationReply from '@/services/notificationReply';
import { answerGuard } from '@/services/answerGuard';
import { usePushRegistration, useNotificationRouting } from './usePush';

const pushData = { v: 1, notificationId: 'notifications:1', kind: 'reminder', threadId: 'threads:1', messageId: 'messages:1', answerToken: 'tok_abc' };
function responseWith(actionIdentifier: string) {
  return { actionIdentifier, notification: { request: { identifier: 'os-id-1', content: { data: pushData, threadIdentifier: 'thread-teal' } } } };
}

jest.mock('expo-notifications', () => {
  const actual = jest.requireActual('expo-notifications');
  return { ...actual, getLastNotificationResponse: jest.fn(() => null), addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })) };
});

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockRegisterMutation = jest.fn().mockResolvedValue(null);
const mockAnswerMutation = jest.fn().mockResolvedValue({ reply: 'ok' });
jest.mock('convex/react', () => ({
  useMutation: jest.fn((fn: unknown) => (fn === 'push.register' ? mockRegisterMutation : mockAnswerMutation)),
}));
jest.mock('./api', () => ({ api: { push: { register: 'push.register' }, notifications: { answer: 'notifications.answer' } } }));

jest.mock('@/services/push', () => ({
  registerNotificationCategories: jest.fn().mockResolvedValue(undefined),
  registerAndroidChannels: jest.fn().mockResolvedValue(undefined),
  configureForegroundNotificationHandler: jest.fn(),
  requestPushRegistration: jest.fn().mockResolvedValue(null),
  subscribeToPushTokenChanges: jest.fn(() => null),
}));

jest.mock('@/services/pendingAnswers', () => ({ drainPendingAnswers: jest.fn().mockResolvedValue(0) }));
jest.mock('@/services/notificationReply', () => ({ showAnswerReply: jest.fn().mockResolvedValue(undefined) }));

const mockedNotifications = Notifications as unknown as { getLastNotificationResponse: jest.Mock; addNotificationResponseReceivedListener: jest.Mock };
const mockedPush = push as unknown as { [K in keyof typeof push]: jest.Mock };
const mockedPending = pendingAnswers as unknown as { drainPendingAnswers: jest.Mock };
const mockedReply = notificationReply as unknown as { showAnswerReply: jest.Mock };
const mockedRouterPush = router.push as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRegisterMutation.mockResolvedValue(null);
  mockAnswerMutation.mockResolvedValue({ reply: 'ok' });
  mockedPush.requestPushRegistration.mockResolvedValue(null);
  mockedPush.subscribeToPushTokenChanges.mockReturnValue(null);
  mockedNotifications.getLastNotificationResponse.mockReturnValue(null);
  mockedNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
  mockedPending.drainPendingAnswers.mockResolvedValue(0);
  // answerGuard is a real, un-mocked module-level singleton (shared app state, not jest mock state) —
  // clearAllMocks doesn't touch it, so each test starts from a clean slate for the pairs this file uses.
  answerGuard.forget('notifications:1', 'on_my_way');
  answerGuard.forget('notifications:1', 'yes');
});

describe('usePushRegistration', () => {
  // Must run first: categories/channels/the foreground handler register only once per app launch
  // (usePush.ts's module-level flag), which this is the one chance to observe from zero.
  test('registers categories/channels/foreground handler once and sends the token to push.register', async () => {
    mockedPush.requestPushRegistration.mockResolvedValue({ token: 'ExponentPushToken[abc]', platform: 'ios' });

    await act(async () => {
      renderHook(() => usePushRegistration());
    });

    expect(mockedPush.registerNotificationCategories).toHaveBeenCalledTimes(1);
    expect(mockedPush.registerAndroidChannels).toHaveBeenCalledTimes(1);
    expect(mockedPush.configureForegroundNotificationHandler).toHaveBeenCalledTimes(1);
    expect(mockRegisterMutation).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]', platform: 'ios' });
  });

  test('a token-change callback re-registers with the fresh token', async () => {
    let onChange: ((r: { token: string; platform: string }) => void) | undefined;
    mockedPush.subscribeToPushTokenChanges.mockImplementation((cb: typeof onChange) => {
      onChange = cb;
      return { remove: jest.fn() };
    });

    await act(async () => {
      renderHook(() => usePushRegistration());
    });
    onChange?.({ token: 'ExponentPushToken[new]', platform: 'ios' });

    expect(mockRegisterMutation).toHaveBeenCalledWith({ token: 'ExponentPushToken[new]', platform: 'ios' });
  });

  test('no token available (declined permission, web, …) never calls push.register', async () => {
    mockedPush.requestPushRegistration.mockResolvedValue(null);
    await act(async () => {
      renderHook(() => usePushRegistration());
    });
    expect(mockRegisterMutation).not.toHaveBeenCalled();
  });
});

describe('useNotificationRouting', () => {
  test('a cold-start default-tap response navigates to the deep link, not an answer', async () => {
    mockedNotifications.getLastNotificationResponse.mockReturnValue(responseWith(DEFAULT_ACTION_IDENTIFIER));

    await act(async () => {
      renderHook(() => useNotificationRouting());
    });

    expect(mockedRouterPush).toHaveBeenCalledWith('/chat/messages:1');
    expect(mockAnswerMutation).not.toHaveBeenCalled();
  });

  test('a button-tap response answers the notification with that button id', async () => {
    let onResponse: ((r: unknown) => void) | undefined;
    mockedNotifications.addNotificationResponseReceivedListener.mockImplementation((cb: typeof onResponse) => {
      onResponse = cb;
      return { remove: jest.fn() };
    });

    await act(async () => {
      renderHook(() => useNotificationRouting());
    });
    await act(async () => {
      onResponse?.(responseWith('on_my_way'));
    });

    expect(mockAnswerMutation).toHaveBeenCalledWith({ notificationId: 'notifications:1', buttonId: 'on_my_way', via: 'push' });
  });

  // G3 follow-up (PLAN §6: "the lock screen shows the MEGA's reply") — the foreground/background listener
  // path still uses the mutation (not the HTTP route), but shows its reply the same shared way.
  test('a button-tap response shows the mutation reply on the lock screen, replacing the original', async () => {
    mockAnswerMutation.mockResolvedValue({ reply: "Told Coral you'll grab it" });
    let onResponse: ((r: unknown) => void) | undefined;
    mockedNotifications.addNotificationResponseReceivedListener.mockImplementation((cb: typeof onResponse) => {
      onResponse = cb;
      return { remove: jest.fn() };
    });

    await act(async () => {
      renderHook(() => useNotificationRouting());
    });
    await act(async () => {
      onResponse?.(responseWith('on_my_way'));
    });

    expect(mockedReply.showAnswerReply).toHaveBeenCalledWith({ identifier: 'os-id-1', threadIdentifier: 'thread-teal' }, "Told Coral you'll grab it");
  });

  test('the same tap replayed by both the cold-start check and the listener only answers once', async () => {
    mockedNotifications.getLastNotificationResponse.mockReturnValue(responseWith('yes'));
    let onResponse: ((r: unknown) => void) | undefined;
    mockedNotifications.addNotificationResponseReceivedListener.mockImplementation((cb: typeof onResponse) => {
      onResponse = cb;
      return { remove: jest.fn() };
    });

    await act(async () => {
      renderHook(() => useNotificationRouting());
    });
    await act(async () => {
      onResponse?.(responseWith('yes')); // the listener replays the same response the cold-start check already handled
    });

    expect(mockAnswerMutation).toHaveBeenCalledTimes(1);
  });

  test('drains any answers the killed-app background task queued', async () => {
    await act(async () => {
      renderHook(() => useNotificationRouting());
    });
    expect(mockedPending.drainPendingAnswers).toHaveBeenCalledTimes(1);
  });

  test('ignoring an unrelated/malformed notification answers nothing and navigates nowhere', async () => {
    mockedNotifications.getLastNotificationResponse.mockReturnValue({ actionIdentifier: DEFAULT_ACTION_IDENTIFIER, notification: { request: { content: { data: { foo: 'bar' } } } } });

    await act(async () => {
      renderHook(() => useNotificationRouting());
    });

    expect(mockedRouterPush).not.toHaveBeenCalled();
    expect(mockAnswerMutation).not.toHaveBeenCalled();
  });
});
