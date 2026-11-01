import type { TimeSlot } from './domain/scheduling';
import { formatLocalDateTime, formatLocalTime } from './time';
/** This is also the exact preview shown before a Gmail draft is created. */
export function schedulingReply(slot: TimeSlot, timezone: string): string {
  return `Would ${formatLocalDateTime(slot.start, timezone)}–${formatLocalTime(slot.end, timezone)} (${timezone}) work? That time looks available on the calendars checked. Please confirm.`;
}
