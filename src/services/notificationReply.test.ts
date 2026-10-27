// PLAN §6: "answering doesn't open the app, and the lock screen shows the MEGA's reply" — shared by
// both answer paths (src/data/usePush.ts's listener, src/services/backgroundNotificationTask.ts's
// killed-app fetch). Scheduling with the same `identifier` replaces the original notification in place.
import * as Notifications from 'expo-notifications';
import { showAnswerReply } from './notificationReply';

jest.mock('expo-notifications', () => {
  const actual = jest.requireActual('expo-notifications');
  return { ...actual, scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled-id') };
});

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('showAnswerReply', () => {
  test('schedules an immediate notification reusing the original identifier and thread', async () => {
    await showAnswerReply({ identifier: 'os-id-1', threadIdentifier: 'thread-teal' }, "Told Coral you'll grab it");
    expect(mockSchedule).toHaveBeenCalledWith({
      identifier: 'os-id-1',
      content: { body: "Told Coral you'll grab it", threadIdentifier: 'thread-teal' },
      trigger: null,
    });
  });

  test('omits threadIdentifier when the original notification had none', async () => {
    await showAnswerReply({ identifier: 'os-id-1' }, 'Snoozed 5 minutes');
    expect(mockSchedule).toHaveBeenCalledWith({ identifier: 'os-id-1', content: { body: 'Snoozed 5 minutes' }, trigger: null });
  });

  test('a scheduling failure never throws — the answer itself already succeeded', async () => {
    mockSchedule.mockRejectedValue(new Error('no native module'));
    await expect(showAnswerReply({ identifier: 'os-id-1' }, 'ok')).resolves.toBeUndefined();
  });
});
