// Owner device test, Oct 29: "Uncaught (in promise) Error: Background remote notifications have not been
// configured". Build cd4140e3 has no `remote-notification` background mode, so expo-notifications rejects
// `registerTaskAsync`; the old `void registerTaskAsync(...)` inside a try/catch let that rejection escape.
import * as Notifications from 'expo-notifications';
import { registerBackgroundNotificationTask } from './backgroundNotificationTask';

jest.mock('expo-notifications', () => ({ ...jest.requireActual('expo-notifications'), registerTaskAsync: jest.fn() }));
const mockRegister = Notifications.registerTaskAsync as jest.Mock;

test('a rejected registerTaskAsync is caught: no unhandled rejection, one dev warning', async () => {
  mockRegister.mockRejectedValue(new Error('Background remote notifications have not been configured.'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(registerBackgroundNotificationTask()).resolves.toBe(false);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('a successful registration resolves true', async () => {
  mockRegister.mockResolvedValue(undefined);
  await expect(registerBackgroundNotificationTask()).resolves.toBe(true);
});
