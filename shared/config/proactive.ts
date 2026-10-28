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
export const requestDedupeKey = (requestId: string): string => `request:${requestId}`;
// GD (v0.13): one key per card-backed trigger, so each card/push is proposed once per recipient.
export const choreRemindDedupeKey = (claimId: string): string => `chore:remind:${claimId}`;
export const choreApproveDedupeKey = (claimId: string, adultId: string): string => `chore:approve:${claimId}:${adultId}`;
export const routineDedupeKey = (runId: string): string => `routine:${runId}`;
export const proposalDedupeKey = (proposalId: string, recipientId: string): string => `proposal:${proposalId}:${recipientId}`;
export const shareSuggestionDedupeKey = (suggestionId: string): string => `shareSuggestion:${suggestionId}`;
export const practiceDedupeKey = (setId: string, recipientId: string): string => `practice:${setId}:${recipientId}`;
export const giftsDedupeKey = (giftIdeasId: string, recipientId: string): string => `gifts:${giftIdeasId}:${recipientId}`;
export const bucksDedupeKey = (ledgerId: string): string => `bucks:${ledgerId}`;
// G4 (v0.15): one weather-alert candidate per (NWS alert × recipient); one rain tip per (event × recipient × day);
// one leave-by reminder per (event × recipient) — a later traffic check re-times that same candidate.
export const weatherAlertDedupeKey = (alertId: string, recipientId: string): string => `weatherAlert:${alertId}:${recipientId}`;
export const weatherEventDedupeKey = (eventId: string, recipientId: string, date: string): string => `weatherEvent:${eventId}:${recipientId}:${date}`;
export const leaveByDedupeKey = (eventId: string, recipientId: string): string => `leaveBy:${eventId}:${recipientId}`;
export const searchNoticeDedupeKey = (searchLogId: string, parentId: string): string => `searchNotice:${searchLogId}:${parentId}`;
/** A clash between two household events that both need the same person (order-independent). */
export const clashDedupeKey = (eventIds: string[], memberId: string): string => `clash:${[...eventIds].sort().join('+')}:${memberId}`;
