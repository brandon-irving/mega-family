// Proactive engine tuning (PLAN.md -> Proactive engine; CONTRACT §2 candidates/notifications/requests).
// Trigger windows and the daily check-in time live here so they're a config edit, not a code edit — the
// judge's push/widget/drop thresholds and per-kind loudness/buttons stay in notifications.ts (they're keyed
// by NotificationKind, not by trigger source).
import type { NotificationKind } from '../domain/enums';
export const PROACTIVE = {
  /** Daily check-in greeting (PLAN.md -> Proactive engine "check-ins: a daily greeting per member at their
   * preferred time"): no per-member preferred-time field exists yet, so every member is greeted at the same
   * family-local time, within a window after it. A future gate can add a per-member preference. */
  checkIn: { time: '08:30', windowMinutes: 60 },
  /** How long after a reminder's `dueAt` its delivery window stays open before the trigger gives up. */
  reminderGraceMinutes: 20,
  /** How soon a cross-member ("matters to") candidate should be delivered once judged worth sending. */
  mattersToWindowMinutes: 120,
  /** How often the production cron (convex/crons.ts) sweeps every family for due triggers/candidates. The
   * demo's simulated clock (`clock.jump`) runs the exact same per-family sweep synchronously instead of
   * waiting for this interval — see convex/model/proactive.ts `tickFamilyLogic`. */
  sweepIntervalMinutes: 5,
  /** G3 security review (S3, MEDIUM): a cross-member "matters to" trigger (convex/model/proactive.ts
   * `scanFamilyEventTriggers`) spends a real draft+judge model call per candidate. Without a cap, a chatty
   * conversation that keeps naming other members (even innocently) could spend a family's whole daily model
   * budget on proactive drafts alone. Once a family hits this many mattersTo-sourced candidates in one local
   * day, any further one is dropped (and logged — see `logMattersToCapped` in model/proactive.ts) instead of
   * spending a model call. A config edit, not a code edit, to retune. */
  mattersToDailyCapPerFamily: 20,
} as const;

/** Sanitizing a draft+judge result before it's ever shown (C6/UX7 security+UX review): a max length so a
 * model that rambles gets cleanly truncated, not just cut off mid-word, and a per-kind emoji allowance that
 * defaults OFF for every kind — the approved boards (design/build/Push.template.html) show MEGA's voice as
 * plain, calm text with no emoji, so stripping is the default and a kind only opts back in via this config,
 * never a code change. */
export const DRAFT_SANITIZE = {
  maxTextLength: 180,
  maxTitleLength: 48,
  /** Per `NotificationKind`: true lets emoji pass through unstripped. All false by default. */
  allowEmoji: { reminder: false, request: false, tip: false, update: false } as Record<NotificationKind, boolean>,
} as const;

/** Every trigger source builds its candidate's `dedupeKey` from one of these, so "the same thing isn't
 * proposed twice" (CONTRACT §2) is one shared string format instead of ad hoc per source. */
export const reminderDedupeKey = (reminderId: string): string => `reminder:${reminderId}`;
export const checkinDedupeKey = (memberId: string, date: string): string => `checkin:${memberId}:${date}`;
export const mattersToDedupeKey = (familyEventId: string): string => `mattersTo:${familyEventId}`;
export const requestDedupeKey = (requestId: string): string => `request:${requestId}`;
