// The walking MEGAs (Screen 9 boards, owner Oct 26: "little MEGAs walking across the screen and
// interacting with the elements on the screen"). Motion numbers and the cast live here so tuning them is a
// config edit; the engine (src/features/walkers/engine.ts) only reads these. HQ (G5) reuses the same layer.
import { COLORS } from './looks';

export const WALKER_MOTION = {
  /** Engine step. 25 steps a second; positions animate between steps (Reanimated, linear). */
  tickMs: 40,
  /** Points walked per step (the boards' 2px at 40ms = 50pt/s, a stroll). */
  speed: 2,
  /** A hop's duration grows with distance, between these bounds; the arc's height grows when hopping up. */
  hop: { minMs: 380, maxMs: 900, msPerPoint: 0.9, lift: 24, liftPerPointUp: 0.6 },
  /** Points a pressable ledge dips while a MEGA stands on it. */
  dip: 2,
  /** Tapping a MEGA: it bounces once and says hi. */
  react: { ms: 1500, bounceMs: 360, bounce: 12 },
  /** Everyone turns toward a press for this long. */
  lookMs: 700,
  /** Walk-cycle length in points walked (stepL / stand / stepR / stand). */
  stride: 16,
  /** The shared loader (owner, Oct 28): one MEGA paces over the words, between these fractions of their
   * width, pausing at each end. Replaces the old "walk in after 300ms" opening (never blank now). */
  loader: { from: 0.3, to: 0.7, pauseMs: 500, startMs: 400 },
  /** The 32x40 walk frames at 1x, inside a 44pt tap target. */
  spriteScale: 1,
  hitSize: 44,
  /** What a MEGA covers on screen, for the "never cover content" rule (owner, Oct 28): the drawn sprite
   * (feet at the bottom center), the speech bubble above the tap target and the emote just above it. The
   * bubble's width is estimated from its words. `tolerance`: overlaps this small (points) don't count. */
  sprite: { w: 32, h: 40 },
  bubble: { h: 24, gap: 4, minW: 80, charW: 7, padX: 16 },
  emote: { w: 14, h: 16, rise: 14 },
  tolerance: 1,
  /** Free space a lane (an empty strip MEGAs walk along, e.g. under the "Sign in" row) reserves. */
  laneHeight: 44,
  /** Waits longer than this never end on their own (a MEGA that stays put). */
  forever: 1e9,
} as const;

export type WalkerId = 'teal' | 'coral' | 'violet';
export const WALKER_IDS: readonly WalkerId[] = ['teal', 'coral', 'violet'];

/** The trio on the sign-in screens: mascots, not anyone's MEGA yet (people make their own after signing in). */
export const WALKER_CAST: Record<WalkerId, { name: string; hex: string }> = {
  teal: { name: 'Teal', hex: COLORS.teal },
  coral: { name: 'Coral', hex: COLORS.coral },
  violet: { name: 'Zap', hex: COLORS.violet },
};
