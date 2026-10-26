// Talk mode tuning (PLAN "Talk mode", decided Oct 24): hold to talk / release to send, slide up to
// lock, chirp + haptic at the start/end of each turn. Kept as config, not magic numbers in the screen,
// per the user's "change behavior through config" rule.
export const TALK_CONFIG = {
  /** How far (px) a finger must slide up from the mic button before it locks into hands-free recording. */
  lockSlideDistancePx: 72,
  /** Below this many recorded ms, a release is treated as an accidental tap, not a message (no chirp-end,
   * no upload) — not a hackathon nice-to-have, but tested directly by the state machine tests. */
  minRecordingMs: 300,
} as const;
