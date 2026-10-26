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
  kidWallpaperMinAge: 13, // kids can't generate wallpapers for now; a future age threshold
  block: { maxOptionsAdult: 8, maxOptionsKid: 4 },
} as const;
