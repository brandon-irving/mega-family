// Default room shape used both by the seed (sample family) and real onboarding, so the two don't drift.
// Furniture presets land in G5 (CONTRACT §2 `rooms`); this is just the starting size and wall color.
export const ROOM_DEFAULTS = {
  hq: { size: { w: 12, h: 9 }, wallColor: '#2E343D' },
  member: { size: { w: 8, h: 7 }, wallColor: '#2E343D' },
} as const;
