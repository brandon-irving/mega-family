import type { AvailabilitySharing, TimeSlot } from './domain/scheduling';
import { formatLocalDateTime, formatLocalTime } from './time';

/** Legacy explicit lists stay scoped to those people; never silently upgrade them to Family. */
export function availabilitySharingMode(preference?: { availabilitySharing?: AvailabilitySharing; availabilityFor: readonly string[] } | null): AvailabilitySharing {
  return preference?.availabilitySharing ?? (preference?.availabilityFor.length ? 'custom' : 'private');
}
/** This is also the exact preview shown before a Gmail draft is created. */
export function schedulingReply(slot: TimeSlot, timezone: string, confirmed = false): string {
  if (confirmed) return `We’ve chosen ${formatLocalDateTime(slot.start, timezone)}–${formatLocalTime(slot.end, timezone)} (${timezone}) from the times you offered. That works for us. Looking forward to speaking with you!`;
  return `Would ${formatLocalDateTime(slot.start, timezone)}–${formatLocalTime(slot.end, timezone)} (${timezone}) work? That time looks available on the calendars checked. Please confirm.`;
}

/** Only sender-offered times with a known duration can be confirmed by selection. */
export function selectionCanConfirm(plan: { selectionConfirms?: boolean; selected?: TimeSlot; slots: TimeSlot[]; missing: string[]; durationAssumed: boolean }): boolean {
  return !!plan.selectionConfirms && !!plan.selected && !plan.missing.length && !plan.durationAssumed
    && plan.slots.some(s => s.start === plan.selected!.start && s.end === plan.selected!.end);
}
