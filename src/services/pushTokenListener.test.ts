// Owner device test, Oct 29: the app was killed by iOS ~40 s after launch with nobody touching it (Hermes heap
// +25–45 MB/s, then signal 9). The token-change listener called getExpoPushTokenAsync(), which calls
// getDevicePushTokenAsync() itself, which fires the token listener again: an endless loop. The SDK 58 docs say
// not to call getDevicePushTokenAsync in this listener; getExpoPushTokenAsync takes the token as
// `devicePushToken` instead (node_modules/expo-notifications/build/getExpoPushTokenAsync.js).
import * as Notifications from 'expo-notifications';
import { subscribeToPushTokenChanges } from './push';

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('expo-notifications'),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[abc]' })),
}));
const mockAdd = Notifications.addPushTokenListener as jest.Mock;
const mockExpoToken = Notifications.getExpoPushTokenAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const flush = () => new Promise((r) => setTimeout(r, 0));

test('the device token from the event is passed through, so the SDK never re-fetches it (no listener loop)', async () => {
  const onNew = jest.fn();
  subscribeToPushTokenChanges(onNew);
  const listener = mockAdd.mock.calls[0][0] as (t: { type: string; data: string }) => void;
  listener({ type: 'ios', data: 'device-1' });
  await flush();
  expect(mockExpoToken).toHaveBeenCalledWith(expect.objectContaining({ devicePushToken: { type: 'ios', data: 'device-1' } }));
  expect(onNew).toHaveBeenCalledTimes(1);
});

test('the same device token again (a repeat event) does nothing; a changed one re-registers', async () => {
  const onNew = jest.fn();
  subscribeToPushTokenChanges(onNew);
  const listener = mockAdd.mock.calls[0][0] as (t: { type: string; data: string }) => void;
  listener({ type: 'ios', data: 'device-2' });
  await flush();
  listener({ type: 'ios', data: 'device-2' });
  await flush();
  expect(mockExpoToken).toHaveBeenCalledTimes(1);
  listener({ type: 'ios', data: 'device-3' });
  await flush();
  expect(mockExpoToken).toHaveBeenCalledTimes(2);
  expect(onNew).toHaveBeenCalledTimes(2);
});
