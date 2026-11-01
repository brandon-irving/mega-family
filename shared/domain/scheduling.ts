import { v, type Infer } from 'convex/values';
export const timeSlot = v.object({ start: v.number(), end: v.number() });
export type TimeSlot = Infer<typeof timeSlot>;
export const planStatus = v.union(...(['proposed', 'review', 'held', 'confirmed', 'cancelled', 'dismissed'] as const).map(x => v.literal(x)));
export const emailPlan = v.object({
  title: v.string(), intent: v.union(v.literal('confirmed'), v.literal('proposed'), v.literal('cancelled'), v.literal('review')),
  slots: v.array(timeSlot), participantNames: v.array(v.string()), missing: v.array(v.string()), durationAssumed: v.boolean(),
});
export type EmailPlan = Infer<typeof emailPlan>;
export const operationStatus = v.union(v.literal('running'), v.literal('done'), v.literal('uncertain'), v.literal('failed'));
export const schedulingPreferences = {
  familyId: v.id('families'), memberId: v.id('members'), desiredWrites: v.optional(v.boolean()), enabled: v.boolean(), autoCapture: v.boolean(), availabilityFor: v.array(v.id('members')),
};
export const mailPlans = {
  familyId: v.id('families'), ownerId: v.id('members'), integrationId: v.id('integrations'), threadId: v.string(),
  sourceMessageId: v.string(), sourceAt: v.number(), sourceLabel: v.string(), title: v.string(),
  status: planStatus, slots: v.array(timeSlot), participantIds: v.array(v.id('members')), missing: v.array(v.string()), durationAssumed: v.boolean(),
  revision: v.number(), createdAt: v.number(), updatedAt: v.number(), eventId: v.optional(v.id('events')), ownsEvent: v.optional(v.boolean()),
  selected: v.optional(timeSlot), messageId: v.optional(v.id('messages')),
  calendarOperation: v.optional(operationStatus), calendarExternalId: v.optional(v.string()),
  draftOperation: v.optional(operationStatus), draftId: v.optional(v.string()), operationRevision: v.optional(v.number()),
  calendarAttempt: v.optional(v.number()), draftAttempt: v.optional(v.number()),
};
export const planView = v.object({
  id: v.id('mailPlans'), title: v.string(), status: planStatus, revision: v.number(), timezone: v.string(),
  slots: v.array(v.object({ ...timeSlot.fields, available: v.boolean(), checked: v.boolean(), alternative: v.boolean() })),
  guidance: v.optional(v.string()), participantNames: v.array(v.string()), unavailableNames: v.array(v.string()), missing: v.array(v.string()), durationAssumed: v.boolean(),
  selected: v.optional(timeSlot), eventId: v.optional(v.id('events')), canUndo: v.boolean(), sourceUrl: v.string(),
  calendarOperation: v.optional(operationStatus), draftOperation: v.optional(operationStatus),
  canWriteCalendar: v.boolean(), canWriteDraft: v.boolean(), replyText: v.optional(v.string()), sourceLabel: v.string(),
});
export type PlanView = Infer<typeof planView>;
export const preferencesView = v.object({
  desiredWrites: v.optional(v.boolean()), configured: v.optional(v.boolean()), gmailConnected: v.optional(v.boolean()), calendarConnected: v.optional(v.boolean()),
  enabled: v.boolean(), autoCapture: v.boolean(), availabilityFor: v.array(v.id('members')),
  people: v.array(v.object({ id: v.id('members'), name: v.string(), sharesWithMe: v.boolean() })),
  canWriteCalendar: v.boolean(), canWriteDraft: v.boolean(),
  detection: v.union(v.literal('push'), v.literal('polling'), v.literal('disconnected')),
});
