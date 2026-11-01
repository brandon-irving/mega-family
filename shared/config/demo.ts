// Demo flags (CONTRACT §7 `demo`). The actual gate reads the deployment's DEMO_MODE env var at call time
// (convex/clock.ts, convex/auth.ts) — it can't live only here, since this file is bundled into the app too
// and must never let a client decide its own demo mode. This just names the mechanism in one place.
export const DEMO = {
  /** The env var name both `clock.jump` and demo sign-in gate on. Must be exactly `'true'` on the deployment. */
  envVar: 'DEMO_MODE',
} as const;

export const DEMO_PROFILE_COPY = {
  title: 'Demo',
  testInvite: 'Test on this device',
  backToAdmin: 'Back to admin',
  switchPerson: 'Switch person',
  switchTitle: 'Test as someone else',
  switchHint: 'Create an invitation in chat or Family, then choose “Test on this device”. People you’ve joined as appear here.',
  fresh: 'Start fresh admin demo',
  resume: 'Resume demo',
  return: 'Return to my family',
  active: 'You’re using a separate demo family.',
  intro: 'Try the complete setup as a new admin. Your current family stays saved.',
  confirmTitle: 'Start from the beginning?',
  confirmBody: 'A new demo family opens in Chat, starting with your name. Then you can set up your MEGA, brief another assistant, and share an invite. Connected accounts are not copied.',
  restartBody: 'This starts a new demo run. Resume demo will open this new run; your original family stays saved.',
  confirm: 'Start demo',
  cancel: 'Cancel',
} as const;


/** The only supported live demo. No addresses or email bodies come from client input. */
export const DEMO_SCENARIO = {
  daughterParentCode: '11111',
  title: 'Demo Console', prefix: 'MEGA_TEST', timezone: 'America/New_York',
  location: 'Orlando, Florida',
  familyName: 'MEGA demo family', workerFreshMs: 45_000, sendTimeoutMs: 120_000,
  personas: [
    { key: 'dad', name: 'Brandon', label: 'Dad · Admin', role: 'admin', email: 'synthetictestuser91@gmail.com' },
    { key: 'mom', name: 'Lovie', label: 'Mom · Adult', role: 'adult', email: 'synthetictestuser68@gmail.com' },
    { key: 'daughter', name: 'Maya', label: 'Daughter · 16', role: 'kid', email: 'testusersynthetic90@gmail.com' },
  ],
  stages: [
    { key: 'meeting', title: '{dad}’s meeting', recipient: 'dad', subject: 'Confirmed: client meeting', body: 'Hi {dad}, your client meeting is confirmed for {date} from 12:00 PM to 1:00 PM {timezone}. The meeting is at our downtown {location} office. This is a private business commitment.' },
    { key: 'publicity', title: '{mom}’s publicity call options', recipient: 'mom', subject: 'Choose a time: book publicity call', body: 'Hi {mom} and {dad}, we would like both of you on the book publicity call on {date}. Would 12:00 PM–1:00 PM or 2:00 PM–3:00 PM {timezone} work? We are planning outreach to libraries and independent bookstores around {location}, where you mentioned you are based. Please choose one time. These are options, not a booking.' },
    { key: 'pickup', title: '{daughter}’s pickup change', recipient: 'daughter', subject: 'Confirmed: {daughter}’s drama pickup at 2:30', body: 'Hi {daughter}, your drama rehearsal on {date} now ends at 2:30 PM {timezone}. Your pickup window is from 2:30 PM to 3:00 PM instead of the previous 3:30 PM pickup. Pickup is at the rehearsal studio in {location}. This new pickup time is confirmed. Please coordinate with your parents about who can pick you up.' },
  ],
  momBrief: { context: '{mom} is a working mother promoting her children’s book. She is new to AI.', goals: 'Help her coordinate her schedule and {daughter}’s activities with less back-and-forth.', firstTask: 'Help me review upcoming commitments and choose a time for my book publicity call.', boundaries: 'Ask before sharing, booking, or contacting anyone.' },
} as const;
export type DemoStage = typeof DEMO_SCENARIO.stages[number]['key'];
export type DemoPersona = typeof DEMO_SCENARIO.personas[number]['key'];

export const DEMO_CLEANUP = { gmailScope: "https://www.googleapis.com/auth/gmail.modify", maxItems: 500, label: "Clear MEGA_TEST emails & events" } as const;

export const DEMO_CONSOLE_TABS = [
  { id: 'people', label: 'People' },
  { id: 'emails', label: 'Emails' },
  { id: 'reset', label: 'Reset' },
  { id: 'animations', label: 'Motion' },
  { id: 'logs', label: 'Logs' },
] as const;
