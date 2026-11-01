/** Email scheduling policy, shared by extraction, execution and the app. */
export const SCHEDULING = {
  inboxLimit: 3, maxPlansPerEmail: 3, maxSlots: 8, maxParticipants: 12, maxLookaheadDays: 60,
  defaultDurationMinutes: 60, maxDurationMinutes: 24 * 60,
  alternativeStepMinutes: 30, alternativeCount: 3, dayStartHour: 9, dayEndHour: 18,
  calendarFreshSeconds: 120, maxAvailabilityEvents: 2000,
  pushPath: '/google/gmail/push', watchRenewHours: 12, watchRenewBeforeHours: 24,
  operationTimeoutSeconds: 120, pushLeaseSeconds: 240,
  pushRetrySeconds: 10, pushMaxRetries: 20, webhookMaxBytes: 16_384,
  env: { topic: 'GOOGLE_GMAIL_PUBSUB_TOPIC', audience: 'GOOGLE_GMAIL_PUSH_AUDIENCE', serviceAccount: 'GOOGLE_GMAIL_PUSH_SERVICE_ACCOUNT' },
  scopes: { calendar: 'https://www.googleapis.com/auth/calendar.events', drafts: 'https://www.googleapis.com/auth/gmail.compose' },
} as const;

export const SCHEDULING_COPY = {
  title: 'Email & scheduling', enable: 'Recognize plans in my email',
  enableDetail: 'Find confirmed events and proposed times. Your email stays private.',
  autoCapture: 'Add confirmed events automatically', autoCaptureDetail: 'Adds clear commitments to your private MEGA calendar. You can undo them.',
  sharing: 'Who can check my availability', sharingDetail: 'Their MEGA can check time slots for plans involving you. Event details stay private. This does not allow booking your calendar.',
  authorize: 'Enable Google holds & reply drafts', authorizeDetail: 'Allow approved calendar holds and Gmail drafts. MEGA never sends the reply for you.',
  settings: 'Scheduling settings', refresh: 'Check availability', dismiss: 'Dismiss', undo: 'Undo calendar addition',
  syncCalendar: 'Update Google Calendar',
  hold: 'Hold this time', draft: 'Save reply draft in Gmail', openMail: 'Open email',
  status: { proposed: 'Choose a time', review: 'Needs your review', held: 'Tentative · waiting for confirmation', confirmed: 'Confirmed', cancelled: 'Cancelled', dismissed: 'Dismissed' },
  missing: 'Some details need clarification. Check the source email before making a plan.',
  unavailable: 'Some availability could not be checked. No claim of a shared free time is made.',
  noSlots: 'None of these times work. Ask for another day or update the options.',
  private: 'Only you can see this email and plan.',
  draftSaved: 'Reply draft saved in Gmail. Review and send it there.',
  uncertain: 'The provider did not confirm the result. Check Gmail or Calendar before trying again.',
  held: 'A tentative hold was added to your calendar only. Others have not accepted yet.',
} as const;

/** Shared setup choices. Authorization and family visibility remain separate decisions. */
export const GOOGLE_SETUP = {
  title: 'Let MEGA help with your week',
  intro: 'Connect Gmail and Google Calendar together. Choose how MEGA helps before continuing to Google.',
  connect: 'Connect Google',
  update: 'Update Google permissions',
  writes: 'Calendar holds & reply drafts',
  writesDetail: 'Let MEGA hold a time or save an email draft when you ask. Replies are never sent automatically.',
  sharing: [
    { key: 'private', title: 'Private', detail: 'Your MEGA helps only you. No family availability sharing.' },
    { key: 'family', title: 'Family coordination', detail: 'Let the people listed below check when you’re free. Email contents and event details stay private.' },
    { key: 'custom', title: 'Choose people', detail: 'Choose who can check your availability.' },
  ],
} as const;
