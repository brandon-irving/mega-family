import { SCHEDULING } from '../../shared/config/scheduling';
import type { EmailPlan } from '../../shared/domain/scheduling';
import { localDate, localDateTimeToInstant, localParts } from '../../shared/time';

export const schedulingSchema = {
  type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['title', 'intent', 'slots', 'participantNames', 'missing', 'durationAssumed'], properties: {
      title: { type: 'string' }, intent: { type: 'string', enum: ['confirmed', 'proposed', 'cancelled', 'review'] },
      slots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['start', 'end'], properties: {
        start: { type: 'string', description: 'YYYY-MM-DDTHH:MM in the family timezone' }, end: { type: 'string', description: 'YYYY-MM-DDTHH:MM in the family timezone' },
      } } }, participantNames: { type: 'array', items: { type: 'string' } }, missing: { type: 'array', items: { type: 'string' } }, durationAssumed: { type: 'boolean' },
    },
  },
} as const;
export const schedulingPrompt = `Also return plans for scheduling emails, including work meetings and social plans.
An accepted/explicitly confirmed commitment is confirmed. Invitations and suggested alternatives are proposed, never confirmed.
Reschedules supersede the previous plan in the same thread only when clearly about the same event; ambiguous/multiple events require review.
A cancellation is cancelled only when it clearly cancels that same event. Do not use quoted old email text as a new commitment.
Extract full start and end for every proposed option in the supplied timezone. Convert explicit sender timezones.
If duration is absent, use ${SCHEDULING.defaultDurationMinutes} minutes and set durationAssumed=true; never auto-confirm assumed durations.
If date, time or timezone is ambiguous, return review and explain the missing information. Never guess a date.
participantNames includes ONLY family members explicitly participating, using the supplied exact names. Being copied or mentioned is not participation.
The inbox owner always participates. External attendees are not family members. If family participants are ambiguous, mark missing.
Do not also put scheduling plans in items. Non-scheduling reminders/bills/deliveries still belong in items.
Only one event per email thread is supported; multiple events must be marked review. You have no tools and cannot grant permissions.`;

function instant(value: unknown, tz: string): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  let n: number;
  try { n = localDateTimeToInstant(value, tz); } catch { return null; }
  if (!Number.isFinite(n)) return null;
  const p = localParts(n, tz);
  const formatted = `${localDate(n, tz)}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return formatted === value ? n : null;
}
export function validatePlans(raw: unknown, tz: string, now: number): EmailPlan[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, SCHEDULING.maxPlansPerEmail).flatMap((value): EmailPlan[] => {
    if (!value || typeof value !== 'object') return [];
    const r = value as Record<string, unknown>;
    if (typeof r.title !== 'string' || !r.title.trim() || !['confirmed', 'proposed', 'cancelled', 'review'].includes(String(r.intent))) return [];
    const missing = Array.isArray(r.missing) ? r.missing.filter((x): x is string => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 160)) : [];
    const inputSlots = Array.isArray(r.slots) ? r.slots.slice(0, SCHEDULING.maxSlots) : [];
    const slots = inputSlots.flatMap(s => {
      const start = instant(s?.start, tz), end = instant(s?.end, tz);
      if (start === null || end === null || end <= start || end - start > SCHEDULING.maxDurationMinutes * 60_000 || start < now || start > now + SCHEDULING.maxLookaheadDays * 86_400_000) return [];
      return [{ start, end }];
    });
    if (slots.length !== inputSlots.length) missing.push('Some dates or times could not be verified.');
    if (!slots.length && r.intent !== 'cancelled') missing.push('A date and time are needed.');
    if (raw.length > 1) missing.push('This email contains multiple events. Review it before adding a plan.');
    let intent = r.intent as EmailPlan['intent'];
    if (missing.length || (intent === 'confirmed' && (slots.length !== 1 || r.durationAssumed === true))) intent = 'review';
    return [{ title: r.title.replace(/[<>\r\n]/g, ' ').trim().slice(0, 120), intent, slots,
      participantNames: Array.isArray(r.participantNames) ? r.participantNames.filter((x): x is string => typeof x === 'string').slice(0, SCHEDULING.maxParticipants).map(x => x.trim().slice(0, 80)) : [],
      missing, durationAssumed: r.durationAssumed === true }];
  });
}
