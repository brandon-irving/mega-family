// GD (CONTRACT v0.13): homework practice, chores and routines for kids (Screen 10 boards).
import type { Role } from '../domain/enums';
import type { ROUTINE_KINDS } from './ids';

export const HOMEWORK = {
  /** Who may photograph a worksheet and make practice from it: adults, for kids they're a parent of. */
  makers: ['admin', 'adult'] as readonly Role[],
  questions: { min: 3, max: 5, default: 5 },
  /** Choices shown per question (big 2-up kid buttons on the board). */
  choicesPerQuestion: 4,
  /** Hints are guiding questions, never the answer. The draft is rejected (and redrafted once) if a hint
   * contains the correct choice's text; see docs/gates/GD.md -> invariants. */
  hintNeverContainsAnswer: true,
  /** A wrong answer can be retried; the attempt is still recorded. */
  retryWrongAnswers: true,
  /** Max image size accepted from the camera sheet (bytes), checked before the model call. */
  maxPhotoBytes: 8 * 1024 * 1024,
} as const;

export const CHORES = {
  /** Who may create chores and approve "Done": adults (any adult in the family). */
  managers: ['admin', 'adult'] as readonly Role[],
  /** Minutes before a chore's time that the kid's reminder push goes out. */
  remindLeadMinutes: 0,
} as const;

export { ROUTINE_KINDS } from './ids';
export type RoutineKind = (typeof ROUTINE_KINDS)[number];

export const ROUTINES = {
  /** Default times (family timezone) when a routine's card is delivered; per-kid overrides live in `routines`. */
  defaultTime: { morning: '07:00', bedtime: '19:45' } satisfies Record<RoutineKind, string>,
  /** Default morning steps for a new kid (the board's four). Parents edit them with `routines.set`. */
  morningSteps: [
    { id: 'dressed', label: 'Get dressed' },
    { id: 'teeth', label: 'Brush your teeth' },
    { id: 'breakfast', label: 'Eat breakfast' },
    { id: 'backpack', label: 'Grab your backpack' },
  ],
  /** Bedtime prep is derived from tomorrow's household-layer events that include the kid (never private
   * events), plus their fixed steps. At most this many items. */
  bedtimeMaxItems: 6,
  /** Fixed bedtime steps (added after the calendar-derived items). */
  bedtimeSteps: [{ id: 'homework', label: 'Homework folder in your bag' }],
} as const;
