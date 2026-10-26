// CONTRACT §5 "Answer path" / §6 "Tapping the notification" — the two branches a response listener
// (foreground/background) and a cold-start `getLastNotificationResponse()` both need to agree on.
import { DEFAULT_ACTION_IDENTIFIER } from 'expo-notifications';
import { interpretNotificationResponse, type NotificationResponseLike } from './notificationResponse';

const data = { v: 1, notificationId: 'notifications:1', kind: 'reminder', threadId: 'threads:1', messageId: 'messages:1' };

function responseWith(actionIdentifier: string, overrideData: unknown = data): NotificationResponseLike {
  return { actionIdentifier, notification: { request: { content: { data: overrideData } } } };
}

describe('interpretNotificationResponse', () => {
  test('a plain tap (default action) opens the chat at that message', () => {
    expect(interpretNotificationResponse(responseWith(DEFAULT_ACTION_IDENTIFIER))).toEqual({ type: 'open', path: '/chat/messages:1' });
  });

  test('a button tap answers with that button id, not navigation', () => {
    expect(interpretNotificationResponse(responseWith('on_my_way'))).toEqual({ type: 'answer', notificationId: 'notifications:1', buttonId: 'on_my_way' });
  });

  test('a different button id on the same notification answers with its own id', () => {
    expect(interpretNotificationResponse(responseWith('snooze_5'))).toEqual({ type: 'answer', notificationId: 'notifications:1', buttonId: 'snooze_5' });
  });

  test('malformed data (missing fields) is ignored rather than crashing', () => {
    expect(interpretNotificationResponse(responseWith(DEFAULT_ACTION_IDENTIFIER, { v: 1 }))).toEqual({ type: 'ignore' });
  });

  test('a non-MEGA push payload (no v:1 marker) is ignored', () => {
    expect(interpretNotificationResponse(responseWith(DEFAULT_ACTION_IDENTIFIER, { foo: 'bar' }))).toEqual({ type: 'ignore' });
  });

  test('null data is ignored', () => {
    expect(interpretNotificationResponse(responseWith(DEFAULT_ACTION_IDENTIFIER, null))).toEqual({ type: 'ignore' });
  });
});
