// G3 scope: "Answers must be idempotent (same notificationId+buttonId twice = one effect)." The
// authoritative guard has to live on the backend (notifications.answer is a mutation another process —
// the background task, CONTRACT §5 — can call independently of the foreground listener, so only a
// server-side check sees every caller), but the app's own listener can fire more than once for the very
// same tap too: `addNotificationResponseReceivedListener` can replay a response that
// `getLastNotificationResponse()` also already returned on cold start, and a slow network means a second
// identical tap is easy to send before the first mutation settles. This in-session guard stops the app
// from ever issuing the *same* call twice in a row; it is deliberately not a substitute for the
// backend's own check, only this session's first line of defense (see the frontend report's contract
// assumption).
export type AnswerGuard = {
  /** True the first time this key is seen, false every time after (until `forget`). */
  shouldSend: (notificationId: string, buttonId: string) => boolean;
  markSent: (notificationId: string, buttonId: string) => void;
  forget: (notificationId: string, buttonId: string) => void;
};

function key(notificationId: string, buttonId: string): string {
  return `${notificationId}:${buttonId}`;
}

export function createAnswerGuard(): AnswerGuard {
  const sent = new Set<string>();
  return {
    shouldSend: (notificationId, buttonId) => !sent.has(key(notificationId, buttonId)),
    markSent: (notificationId, buttonId) => {
      sent.add(key(notificationId, buttonId));
    },
    forget: (notificationId, buttonId) => {
      sent.delete(key(notificationId, buttonId));
    },
  };
}

/** One guard for the app's lifetime (module-level singleton) shared by every *push-originated* path that
 * can issue the same `notifications.answer` call more than once: the response listener, the cold-start
 * `getLastNotificationResponse()` check (which can both fire for the same tap), and the pending-answers
 * queue drained from a background-task tap (src/services/pendingAnswers.ts). The thread/Today buttons
 * (Cards.tsx, TodayContent.tsx) are a single explicit tap each and aren't routed through this — they rely
 * on the backend's own idempotency (see the frontend report's contract assumption) plus their own
 * optimistic-collapse UI already preventing a second press once answered. */
export const answerGuard = createAnswerGuard();
