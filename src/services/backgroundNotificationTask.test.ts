// G3 follow-up (killed-app answer path, CONTRACT §5 v0.10 pending approval): the background task POSTs
// straight to `<CONVEX_SITE_URL>/push/answer` with the push's `answerToken` (no authenticated session
// available in that headless context) and shows the reply via the shared helper; a network failure or a
// missing token falls back to the existing durable queue. Tests `handleBackgroundNotificationResponse`
// directly — `TaskManager.defineTask`'s own registration isn't something Jest can trigger.
import { DEFAULT_ACTION_IDENTIFIER } from 'expo-notifications';
import { handleBackgroundNotificationResponse } from './backgroundNotificationTask';
import { enqueuePendingAnswer } from './pendingAnswers';
import { showAnswerReply } from './notificationReply';

const SITE_URL = 'https://colorless-ibis-289.convex.site';
jest.mock('./convexConfig', () => ({ CONVEX_SITE_URL: 'https://colorless-ibis-289.convex.site' }));
jest.mock('./pendingAnswers', () => ({ enqueuePendingAnswer: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./notificationReply', () => ({ showAnswerReply: jest.fn().mockResolvedValue(undefined) }));

const ANSWER_TOKEN = 'tok_super_secret_do_not_log_me';
const pushData = { v: 1, notificationId: 'notifications:1', kind: 'reminder', threadId: 'threads:1', messageId: 'messages:1', answerToken: ANSWER_TOKEN };

function actionResponse(actionIdentifier: string, overrideData: unknown = pushData) {
  return { actionIdentifier, notification: { request: { identifier: 'os-id-1', content: { data: overrideData, threadIdentifier: 'thread-teal' } } } };
}

const mockEnqueue = enqueuePendingAnswer as jest.Mock;
const mockShowReply = showAnswerReply as jest.Mock;
let fetchMock: jest.Mock;
let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  consoleSpies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

function noConsoleCallMentionsToken() {
  for (const spy of consoleSpies) {
    for (const call of spy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(ANSWER_TOKEN);
      }
    }
  }
}

describe('handleBackgroundNotificationResponse', () => {
  test('success: POSTs the answer token and shows the reply, without queuing anything', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reply: "Told Coral you'll grab it" }) });

    await handleBackgroundNotificationResponse(actionResponse('yes'));

    expect(fetchMock).toHaveBeenCalledWith(
      `${SITE_URL}/push/answer`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ notificationId: 'notifications:1', buttonId: 'yes', answerToken: ANSWER_TOKEN }) }),
    );
    expect(mockShowReply).toHaveBeenCalledWith({ identifier: 'os-id-1', threadIdentifier: 'thread-teal' }, "Told Coral you'll grab it");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('a network failure falls back to the durable queue', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await handleBackgroundNotificationResponse(actionResponse('yes'));

    expect(mockEnqueue).toHaveBeenCalledWith('notifications:1', 'yes', expect.any(Number));
    expect(mockShowReply).not.toHaveBeenCalled();
  });

  test('a non-OK response (e.g. an invalid token) also falls back to the queue', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid token' }) });

    await handleBackgroundNotificationResponse(actionResponse('yes'));

    expect(mockEnqueue).toHaveBeenCalledWith('notifications:1', 'yes', expect.any(Number));
    expect(mockShowReply).not.toHaveBeenCalled();
  });

  test('a missing answerToken falls back to the queue without ever attempting the fetch', async () => {
    const { answerToken, ...withoutToken } = pushData;
    void answerToken;

    await handleBackgroundNotificationResponse(actionResponse('yes', withoutToken));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith('notifications:1', 'yes', expect.any(Number));
  });

  test('the answer token is never logged, on the success path or any fallback path', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reply: 'ok' }) });
    await handleBackgroundNotificationResponse(actionResponse('yes'));
    noConsoleCallMentionsToken();

    fetchMock.mockRejectedValue(new Error('offline'));
    await handleBackgroundNotificationResponse(actionResponse('yes'));
    noConsoleCallMentionsToken();
  });

  test('a plain tap (default action) is ignored — the normal foreground/background listener handles it', async () => {
    await handleBackgroundNotificationResponse(actionResponse(DEFAULT_ACTION_IDENTIFIER));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('a bare data-only payload (not an action response) is ignored', async () => {
    await handleBackgroundNotificationResponse({ notification: null, data: { dataString: '{}' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
