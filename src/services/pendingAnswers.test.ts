// Backs the killed-app answer path (pendingAnswers.ts docstring): a background-task tap is queued
// durably and later drained through the real, authenticated mutation once the app actually launches.
import * as SecureStore from 'expo-secure-store';
import { drainPendingAnswers, enqueuePendingAnswer } from './pendingAnswers';

jest.mock('expo-secure-store', () => {
  let store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    __reset: () => {
      store = {};
    },
  };
});

beforeEach(() => {
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('pendingAnswers', () => {
  test('an enqueued answer is drained through send and removed from the queue', async () => {
    await enqueuePendingAnswer('n1', 'yes', 1000);
    const send = jest.fn().mockResolvedValue(undefined);
    const sentCount = await drainPendingAnswers(send);
    expect(sentCount).toBe(1);
    expect(send).toHaveBeenCalledWith('n1', 'yes');
    expect(await drainPendingAnswers(send)).toBe(0); // nothing left queued
  });

  test('queuing the same notificationId+buttonId twice only drains once (idempotent)', async () => {
    await enqueuePendingAnswer('n1', 'yes', 1000);
    await enqueuePendingAnswer('n1', 'yes', 2000);
    const send = jest.fn().mockResolvedValue(undefined);
    await drainPendingAnswers(send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('a failed send keeps the entry queued for the next drain', async () => {
    await enqueuePendingAnswer('n1', 'yes', 1000);
    const failing = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await drainPendingAnswers(failing)).toBe(0);
    const succeeding = jest.fn().mockResolvedValue(undefined);
    expect(await drainPendingAnswers(succeeding)).toBe(1);
  });

  test('multiple distinct queued answers all drain', async () => {
    await enqueuePendingAnswer('n1', 'yes', 1000);
    await enqueuePendingAnswer('n2', 'cant', 2000);
    const send = jest.fn().mockResolvedValue(undefined);
    expect(await drainPendingAnswers(send)).toBe(2);
  });
});
