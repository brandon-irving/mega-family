// G5 (CONTRACT v0.17): the onboarding chat (owner, Oct 28; canvas Screen 13), schedule links (.ics), this phone's
// calendar, and the nightly profiler. Owned by the backend, read by both. Copy lives in ./copy.ts G5_COPY.
import { COLORS } from './looks';

export const ONBOARDING = {
  /** The admin's MEGA before they customize it (tapping the badge in the chat header opens Profile). Moved here
   * from the interim src/app/onboarding.tsx (G5 replaces that screen). */
  firstMega: { name: 'Teal', look: { hex: COLORS.teal, sticker: 'star' as const }, personality: 'calm' as const },
  /** The family's name until the admin changes it in Settings → Family ("{name}'s family" once named). */
  familyNameTemplate: '{name}’s family',
  /** What they type back to "What should I call you?": a name, trimmed, at most this long. Leading phrases
   * ("call me", "I'm", "my name is", "it's") are stripped deterministically; no model call. */
  nameMaxLength: 30,
  namePrefixes: ['call me', 'you can call me', 'my name is', 'my name’s', "my name's", 'i am', 'i’m', "i'm", 'it’s', "it's", 'this is'],
  /** The integration offers, in order, after the name (owner: Gmail first). Each has Not now. */
  offers: ['gmail', 'calendar', 'ics'] as const,
  /** Gmail's first look-back when connected during onboarding (board: "checking the last 30 days"). */
  gmailFirstLookDays: 30,
  /** v0.17a (G5 backend): `family.add` refuses past this many members (a sanity cap, not a product limit). */
  maxFamilyMembers: 12,
} as const;

/** Schedule links (school, team calendars). Fetched by the server; the URL can carry a private token, so it is
 * never returned to the app after it's saved (only `host` and the feed's title). */
export const ICS = {
  pollMinutes: 30,
  maxFeedsPerMember: 5,
  maxBytes: 1_000_000,
  maxEvents: 1000,
  /** Recurring events (RRULE) are expanded inside this window only. */
  pastDays: 7,
  futureDays: 120,
  maxOccurrencesPerRule: 200,
  timeoutMs: 10_000,
  /** `webcal://` is rewritten to `https://`; plain http is refused. */
  allowedSchemes: ['https:', 'webcal:'],
} as const;

/** This phone's calendar (expo-calendar, installed; native packages are frozen). The app reads events and syncs
 * them up; the server never sees the phone's calendar otherwise. */
export const DEVICE_CALENDAR = {
  pastDays: 7,
  futureDays: 60,
  maxEventsPerSync: 500,
  /** v0.17a: how many of the phone's calendars one connection may pick. */
  maxCalendars: 20,
  /** The app syncs on open when the last sync is older than this. */
  syncEveryMinutes: 30,
} as const;

/** The nightly profiler (PLAN.md → Learning): turns the day's memories into profile updates; uncertain ones become
 * check questions the MEGA asks later as a choice block ("Is soccer still Mondays and Wednesdays?"). */
export const PROFILER = {
  /** Local time in the family's timezone. */
  runAt: '02:30',
  /** Confidence (0–1, from the structured model call) at or above which an update is applied directly. */
  applyMinConfidence: 0.8,
  /** Below apply but at or above this → a check question; below → dropped. */
  askMinConfidence: 0.5,
  maxCheckQuestionsPerMemberPerDay: 1,
  /** When the check question may be asked (local time window), as a quiet `request`. */
  askWindow: { start: '16:00', end: '19:30' },
  maxMemoriesPerRun: 40,
  /** v0.17a: how often the sweep checks whether a family's run time / ask window has come. */
  sweepMinutes: 30,
} as const;
