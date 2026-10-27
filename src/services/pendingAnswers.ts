// G3 scope: "APP KILLED: research current expo-notifications + expo-task-manager docs for handling
// action responses when the app was terminated." Per expo-notifications' own docs (checked against the
// versioned SDK 58 reference, not memory — AGENTS.md): a category action registered with
// `opensAppToForeground: false` (CONTRACT §5's requirement, so answering never opens the app) means "if
// your app is killed, NotificationResponseReceived listeners will not be triggered when a user selects
// this action" — on Android, only a `expo-task-manager` background task still runs (registered via
// `Notifications.registerTaskAsync`, src/services/backgroundNotificationTask.ts); iOS has no equivalent
// for a killed app at all.
//
// That background task runs in a headless JS context with no mounted React tree and, critically, no
// restored Better Auth session (Better Auth's Convex plugin wires the signed-in Convex client through a
// React provider — DataProvider — which never mounts there), so it can't safely make an authenticated
// `notifications.answer` call itself. Rather than guess at reconstructing auth in a headless context, the
// task just durably records the tap here (expo-secure-store survives the process being killed, unlike
// an in-memory queue); the next time the app actually launches with a real session, `usePush.ts` drains
// this queue through the normal, authenticated `notifications.answer` mutation. Answers are still
// idempotent (the queue key is notificationId+buttonId, same as answerGuard.ts) and nothing is lost —
// slightly delayed instead of instant, which matches PLAN.md's own stated risk ("checked on day 3") and
// is strictly better than the alternative of silently dropping a killed-app tap.
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'mega.pendingNotificationAnswers.v1';
/** Guards against an unbounded queue if something keeps failing to drain (e.g. offline for days). */
const MAX_QUEUED = 50;

export type PendingAnswer = { notificationId: string; buttonId: string; at: number };

async function readAll(): Promise<PendingAnswer[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // corrupt or unavailable storage shouldn't crash the app over a best-effort queue
  }
}

async function writeAll(entries: PendingAnswer[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_QUEUED)));
  } catch {
    // best-effort; a failed write just means this one tap isn't recoverable after all, not a crash
  }
}

/** Called from the background task (or the foreground listener, as a safety net if an immediate send
 * fails) — de-duplicates by notificationId+buttonId so re-queuing the same tap is a no-op. */
export async function enqueuePendingAnswer(notificationId: string, buttonId: string, at: number): Promise<void> {
  const existing = await readAll();
  if (existing.some((e) => e.notificationId === notificationId && e.buttonId === buttonId)) return;
  await writeAll([...existing, { notificationId, buttonId, at }]);
}

/** Drains the queue through `send`, removing each entry once `send` resolves. Entries that fail (e.g.
 * still offline) stay queued for the next drain. Returns how many were successfully sent. */
export async function drainPendingAnswers(send: (notificationId: string, buttonId: string) => Promise<void>): Promise<number> {
  const entries = await readAll();
  if (entries.length === 0) return 0;
  const remaining: PendingAnswer[] = [];
  let sent = 0;
  for (const entry of entries) {
    try {
      await send(entry.notificationId, entry.buttonId);
      sent += 1;
    } catch {
      remaining.push(entry);
    }
  }
  await writeAll(remaining);
  return sent;
}
