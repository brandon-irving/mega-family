// Proactive engine tuning (PLAN.md -> Proactive engine; CONTRACT §2 candidates/notifications/requests).
// Trigger windows and the daily check-in time live here so they're a config edit, not a code edit — the
// judge's push/widget/drop thresholds and per-kind loudness/buttons stay in notifications.ts (they're keyed
// by NotificationKind, not by trigger source).
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
} as const;

/** Every trigger source builds its candidate's `dedupeKey` from one of these, so "the same thing isn't
 * proposed twice" (CONTRACT §2) is one shared string format instead of ad hoc per source. */
export const reminderDedupeKey = (reminderId: string): string => `reminder:${reminderId}`;
export const checkinDedupeKey = (memberId: string, date: string): string => `checkin:${memberId}:${date}`;
export const mattersToDedupeKey = (familyEventId: string): string => `mattersTo:${familyEventId}`;
export const requestDedupeKey = (requestId: string): string => `request:${requestId}`;
