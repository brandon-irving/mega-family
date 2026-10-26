// G3 scope: "Answers must be idempotent (same notificationId+buttonId twice = one effect)" — this is
// the frontend's first line of defense against the response listener / cold-start check / pending-queue
// drain issuing the same mutation call twice for one tap (see answerGuard.ts's docstring for why the
// real guarantee still has to come from the backend too).
import { createAnswerGuard } from './answerGuard';

describe('createAnswerGuard', () => {
  test('the same notificationId+buttonId pair is only allowed through once', () => {
    const guard = createAnswerGuard();
    expect(guard.shouldSend('n1', 'yes')).toBe(true);
    guard.markSent('n1', 'yes');
    expect(guard.shouldSend('n1', 'yes')).toBe(false);
    expect(guard.shouldSend('n1', 'yes')).toBe(false); // still false on repeated checks
  });

  test('a different button id on the same notification is independent', () => {
    const guard = createAnswerGuard();
    guard.markSent('n1', 'yes');
    expect(guard.shouldSend('n1', 'cant')).toBe(true);
  });

  test('a different notification with the same button id is independent', () => {
    const guard = createAnswerGuard();
    guard.markSent('n1', 'yes');
    expect(guard.shouldSend('n2', 'yes')).toBe(true);
  });

  test('forget clears the guard, allowing a retry after a failed send', () => {
    const guard = createAnswerGuard();
    guard.markSent('n1', 'yes');
    guard.forget('n1', 'yes');
    expect(guard.shouldSend('n1', 'yes')).toBe(true);
  });
});
