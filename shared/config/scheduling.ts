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
  choose: 'Choose this time',
  offeredReview: 'This holds the time on your calendar and asks the named family participants to accept. Once everyone agrees, the event becomes confirmed automatically because the sender offered this slot. No email is sent.',
  hold: 'Hold this time', draft: 'Save reply draft in Gmail', openMail: 'Open email',
  status: { proposed: 'Choose a time', review: 'Needs your review', held: 'Tentative · waiting for confirmation', confirmed: 'Confirmed', cancelled: 'Cancelled', dismissed: 'Dismissed' },
  missing: 'Some details need clarification. Check the source email before making a plan.',
  unavailable: 'Some availability could not be checked. No claim of a shared free time is made.',
  noSlots: 'None of these times work. Ask for another day or update the options.',
  private: 'Your email stays private. Holding a time shares its title and time with the named family participants.',
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
  noSharingRecipients: 'You can choose Family coordination now, or choose specific people once you add family members.',
  familyFuture: 'New adults and parent-approved teens in your family will be included automatically.',
  familyEmpty: 'Family coordination is selected. Availability will be shared when you add adults or parent-approved teens to your family.',
  sharing: [
    { key: 'private', title: 'Private', detail: 'Your MEGA helps only you. No family availability sharing.' },
    { key: 'family', title: 'Family coordination', detail: 'Let current and future adults and parent-approved teens in your family check when you’re free. Email contents and event details stay private.' },
    { key: 'custom', title: 'Choose people', detail: 'Choose who can check your availability.' },
  ],
} as const;

/** Deterministic explanations only use availability the viewer may check. */
export const COORDINATION_COPY = {
  cancelled: (title: string, hasCalendarEvent: boolean) => `${title} was cancelled. You don’t need to respond to the earlier request.${hasCalendarEvent ? ' I’m removing its event from your calendar.' : ''}`,
  permissionReview: (name: string) => `A registered parent needs to review scheduling permissions for ${name}.`,
  approvalRequired: 'A parent must approve teen scheduling connections first.',
  emailTitle: 'A plan from your email',
  emailBody: 'I found a scheduling update. Open our chat to review it.',
  parentTitle: 'A shared calendar update',
  parentBody: (name: string) => `${name} shared a calendar event. Open it to see whether you need to plan around it.`,
  approvalTitle: 'Account connection request',
  approvalBody: 'Open our chat to review an account connection request.',
  unknown: (names: string[]) => `I still need to check availability for ${names.join(', ')} before recommending a shared time.`,
  conflict: (names: string[], when: string) => `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} busy at ${when}, based on shared availability.`,
  available: (when: string) => `${when} works with the calendars I could check. Would you like to hold it?`,
  noSlots: 'I couldn’t find a time that works for everyone among these options. Let’s try another day.',
} as const;

/** Voice changes the introduction, never the verified availability facts. */
export const SCHEDULING_VOICE = {
  calm: { intro: (title: string) => `I found an email about scheduling ${title}.`, conflict: 'There’s a timing clash to work around.' },
  cheerful: { intro: (title: string) => `You’ve got an invitation to plan ${title}!`, conflict: 'There’s one timing clash, but let’s work through it together.' },
  funny: { intro: (title: string) => `An email about ${title} just landed. Let’s give it a spot on the calendar.`, conflict: 'A small calendar traffic jam first.' },
  brief: { intro: (title: string) => `New email: ${title}.`, conflict: 'One conflict:' },
} as const;
