// Limits and defaults. All tunable here.
export const LIMITS = {
  agent: { maxSteps: 6 },
  push: { dailyCapAdult: 8, dailyCapKid: 4 },
  quietHours: { adult: { start: '22:00', end: '07:00' }, kid: { start: '20:30', end: '07:00' } },
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
  /** Spoken-MEGA-name matching (CONTRACT §4 "Spoken MEGA names"). Below this similarity the loose
   * sound-alike match is dropped rather than guessed; there's no model call to escalate to yet (G1). */
  mention: { minSimilarity: 0.72 },
  memories: {
    /** `memories.list`'s merge path (more than one scope key and/or a text search): one bounded `take`
     * per scope key, merged in memory — correct for a family's small memory set, but not a true
     * cursor-paginated search (documented limitation, convex/memories.ts). */
    mergeSearchCapPerScope: 200,
  },
} as const;
