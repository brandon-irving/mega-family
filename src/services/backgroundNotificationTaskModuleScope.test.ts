// G3 review fix (HIGH, "iOS force-quit answers"): `handleModuleScopeResponseIfNoSession` is the iOS
// module-scope entry point's decision logic (registered at module scope in backgroundNotificationTask.ts,
// alongside Android's TaskManager task). It must defer to the mounted listener (src/data/usePush.ts)
// when one exists (notificationListenerState.ts), and otherwise answer through the exact same token
// route the Android background task uses — de-duped against a second delivery of the same tap (the
// listener firing right after the cold-start check already consumed it, or vice versa) via the shared
// `answerGuard` singleton.
import { DEFAULT_ACTION_IDENTIFIER } from 'expo-notifications';
import { answerGuard } from './answerGuard';
import { handleModuleScopeResponseIfNoSession } from './backgroundNotificationTask';
import { setNotificationListenerMounted } from './notificationListenerState';
import { enqueuePendingAnswer } from './pendingAnswers';
import { showAnswerReply } from './notificationReply';

const SITE_URL = 'https://colorless-ibis-289.convex.site';
jest.mock('./convexConfig', () => ({ CONVEX_SITE_URL: 'https://colorless-ibis-289.convex.site' }));
jest.mock('./pendingAnswers', () => ({ enqueuePendingAnswer: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./notificationReply', () => ({ showAnswerReply: jest.fn().mockResolvedValue(undefined) }));

const mockEnqueue = enqueuePendingAnswer as jest.Mock;
const mockShowReply = showAnswerReply as jest.Mock;
let fetchMock: jest.Mock;

function actionResponse(actionIdentifier: string, notificationId = 'notifications:1', answerToken: string | undefined = 'tok_abc') {
  const data = { v: 1, notificationId, kind: 'reminder', threadId: 'threads:1', messageId: 'messages:1', answerToken };
  return { actionIdentifier, notification: { request: { identifier: 'os-id-1', content: { data, threadIdentifier: 'thread-teal' } } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  setNotificationListenerMounted(false);
  // `answerGuard` is a real module-level singleton (shared with the whole app, including the mounted
  // listener) — reset the keys this file uses so one test's "already sent" can't leak into the next.
  answerGuard.forget('notifications:1', 'yes');
  answerGuard.forget('notifications:2', 'yes');
});

describe('handleModuleScopeResponseIfNoSession', () => {
  test('no mounted session yet: answers through the token route, same as the Android background task', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reply: 'Got it' }) });

    await handleModuleScopeResponseIfNoSession(actionResponse('yes'));

    expect(fetchMock).toHaveBeenCalledWith(
      `${SITE_URL}/push/answer`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ notificationId: 'notifications:1', buttonId: 'yes', answerToken: 'tok_abc' }) }),
    );
    expect(mockShowReply).toHaveBeenCalledWith({ identifier: 'os-id-1', threadIdentifier: 'thread-teal' }, 'Got it');
  });

  test('a mounted session (src/data/usePush.ts already listening): defers entirely, touching neither fetch nor the queue', async () => {
    setNotificationListenerMounted(true);

    await handleModuleScopeResponseIfNoSession(actionResponse('yes'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('a second delivery of the exact same tap (cold-start check racing the listener) only answers once', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reply: 'Got it' }) });

    await Promise.all([handleModuleScopeResponseIfNoSession(actionResponse('yes')), handleModuleScopeResponseIfNoSession(actionResponse('yes'))]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a different notification is handled independently of an already-guarded one', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reply: 'Got it' }) });

    await handleModuleScopeResponseIfNoSession(actionResponse('yes', 'notifications:1'));
    await handleModuleScopeResponseIfNoSession(actionResponse('yes', 'notifications:2'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a plain tap (default action) is ignored — the normal listener/cold-start check handles navigation', async () => {
    await handleModuleScopeResponseIfNoSession(actionResponse(DEFAULT_ACTION_IDENTIFIER));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a network failure still falls back to the durable queue, same as the Android path', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await handleModuleScopeResponseIfNoSession(actionResponse('yes'));

    expect(mockEnqueue).toHaveBeenCalledWith('notifications:1', 'yes', expect.any(Number));
  });

  test('after handling, the guard is released so a later authenticated retry (drainPendingAnswers) is never silently skipped', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reply: 'Got it' }) });

    await handleModuleScopeResponseIfNoSession(actionResponse('yes'));

    expect(answerGuard.shouldSend('notifications:1', 'yes')).toBe(true);
  });
});
