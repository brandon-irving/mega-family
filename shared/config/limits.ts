// Limits and defaults. All tunable here.
export const LIMITS = {
  // Muse Spark is a reasoning model: hidden reasoning tokens count against max_tokens (PLAN.md → Smoke test
  // results), so these are generous even for "quick" structured calls, with reasoning_effort 'low' to keep
  // them fast and cheap rather than relying on a tiny max_tokens (which can return an empty reply).
  // Muse Spark is a reasoning model: hidden reasoning counts against max tokens, so limits leave room for it
  // and `effort` stays low (G2 live check: default effort spent all 1,200 tokens reasoning and replied with nothing).
  agent: { maxSteps: 6, maxTokensReply: 4000, maxTokensTool: 800, maxTokensStructured: 1500, effort: 'low' as const },
  push: {
    dailyCapAdult: 8,
    dailyCapKid: 4,
    /** How long a push payload's `answerToken` (CONTRACT §5 v0.11) stays valid — the HMAC-signed,
     * notification-scoped token that lets the background notification-response task (no signed-in
     * session) call `POST /push/answer` after the app has been killed. Matches the notification's own
     * practical shelf life; there's no reason to answer a week-old reminder by then. */
    answerTokenTtlDays: 7,
    /** `POST /push/answer`'s brute-force guard (same shape as `invites.redeem`'s `maxParentCodeAttempts`):
     * once a notification has this many failed verification attempts, every further attempt against it —
     * right token or not — gets the same generic error. */
    maxAnswerTokenAttempts: 10,
    /** C7: how long after a push send to poll Expo's `getReceipts` for delivery errors not visible in the
     * immediate send ticket (per the current Expo push docs, `DeviceNotRegistered` and other delivery
     * failures can surface here ~15 minutes after send, separate from the synchronous ticket response). */
    receiptCheckDelayMinutes: 15,
  },
  quietHours: { adult: { start: '22:00', end: '07:00' }, kid: { start: '20:30', end: '07:00' } },
  /** G3 review fix (BLOCKER, deep link to an older message): `MessageList.tsx` calls `onLoadMore`
   * repeatedly to find a `scrollToMessageId` target that isn't in the first loaded page, bounded by
   * this count rather than looping until pagination is exhausted (a years-old message would otherwise
   * page through the whole thread). Once the bound is hit (or pagination actually is exhausted first),
   * it shows "Couldn't find that message" instead of searching forever. */
  // starterLookback: how many recent thread messages (and family members) `chat.start` checks.
  chat: { deepLinkMaxLoadMorePages: 10, starterLookback: 50 },
  spend: { centsPerFamilyPerDay: 100, centsTotalUntilG6: 500 },
  comingUpWindowMin: 120,
  maxEventHours: 24, // range queries look back this far for events still running
  contextDays: 7,
  invite: { ttlHours: 72 },
  parentCodeDigits: 5,
  /** `invites.redeem`'s parent-code attempt counter (convex/invites.ts, invites.failedAttempts,
   * CONTRACT.md v0.4 — additive): a 5-digit code is only 100,000 combinations, brute-forceable with no
   * limit. Once an invite hits this many wrong guesses it's locked (RATE_LIMITED) — even the right code
   * stops working — and the admin creates a fresh invite (`invites.create`) rather than this needing its
   * own "unlock" endpoint to guard separately. */
  maxParentCodeAttempts: 5,
  kidWallpaperMinAge: 13, // kids can't generate wallpapers for now; a future age threshold
  block: { maxOptionsAdult: 8, maxOptionsKid: 4 },
  /** Spoken-MEGA-name matching (CONTRACT §4 "Spoken MEGA names"). >= minSimilarity: confident loose match,
   * no model call needed. Between escalateFloor and minSimilarity: "uncertain" — Muse Spark is asked to
   * confirm or reject (G2). Below escalateFloor: too weak to bother the model with, dropped outright. */
  mention: { minSimilarity: 0.72, escalateFloor: 0.5 },
  memories: {
    /** `memories.list`'s merge path (more than one scope key and/or a text search): one bounded `take`
     * per scope key, merged in memory — correct for a family's small memory set, but not a true
     * cursor-paginated search (documented limitation, convex/memories.ts). */
    mergeSearchCapPerScope: 200,
  },
} as const;
