// Product copy for things that go wrong, so a friendly line is a config edit, not a string baked into
// a component (user's "change behavior through config" rule). Keyed by CONTRACT §9 error codes, plus
// the two non-`done` chat.streamBody statuses (CONTRACT §4 `chat.streamBody`).
import type { ErrorCode } from '../domain/enums';

export type RetryCopyKey = ErrorCode | 'error' | 'timeout' | 'default';

/** G3 review fix (MEDIUM): the chat header's status line is a placeholder — its live version comes from
 * HQ job events in G5 (not built yet; see the header comment at the call site,
 * src/app/(tabs)/chat/index.tsx, and ChatHeader.tsx). A config string, not a literal in the component,
 * per "change behavior through config" — swapping in the real copy later (or restyling it) is a config
 * edit at the call site, not a hunt through JSX. */
export const CHAT_STATUS_PLACEHOLDER = 'Ready to help';

/** The chat screen's own lines. */
export const CHAT_COPY = {
  /** Loading the thread, or waiting for the MEGA's first messages (never an empty-state line). */
  opening: 'Opening chat…',
} as const;

/** The chat composer's words (canvas v33 thread.html). `{mega}` is the MEGA's name. */
/** Words every modal shares (the ✕ button's label for screen readers). */
export const MODAL_COPY = { close: 'Close' } as const;

export const COMPOSER_COPY = {
  talkTo: 'Talk to {mega}',
  typeInstead: 'Type instead',
  talkInstead: 'Talk instead',
  kidPlaceholder: 'Type to {mega}…',
  // Short enough to fit at 390pt beside the buttons (a placeholder can't ellipsize on web; UX review Oct 28).
  adultPlaceholder: 'Message {mega}…',
  fieldLabel: 'Message {mega}',
  send: 'Send message',
} as const;

/** What a MEGA says when its own turn goes wrong (convex/agent/loop.ts), plus the one nudge prompt, so the
 * wording is a config edit. */
export const AGENT_COPY = {
  /** The model ran its tools (or thought) and then said nothing: one nudge for a real reply. */
  emptyReplyNudge: 'Reply to the member now in one or two short sentences, based on what you just did or found.',
  /** Still nothing after the nudge: be honest and ask again, never a vague "not sure how to respond". */
  emptyReplyFallback: 'Sorry, I lost my train of thought there. Could you ask me that again?',
  modelUnreachable: "Sorry — I'm having trouble reaching my brain right now. Try again in a moment.",
} as const;

export const ERROR_COPY: Record<RetryCopyKey, string> = {
  UNAUTHENTICATED: "You've been signed out. Sign in again to keep chatting.",
  NOT_A_MEMBER: "That didn't go through — try again in a moment.",
  FORBIDDEN: "I can't do that one.",
  NOT_FOUND: "I couldn't find that anymore.",
  INVALID_INVITE: 'That invite link has expired or was already used.',
  WRONG_PARENT_CODE: "That parent code didn't match.",
  RATE_LIMITED: "That's a lot of tries — give it a moment and try again.",
  BUDGET_EXCEEDED: "I've used up today's budget for the family. Try again tomorrow.",
  KID_BLOCKED: "I can't help with that one. Ask a grown-up.",
  VALIDATION: "That didn't look right — want to try again?",
  error: 'Something went wrong on my end.',
  timeout: 'That took too long to come back.',
  default: 'Something went wrong. Want to try again?',
};

/** GD (CONTRACT v0.13): the agent-identity disclosure on every clash proposal (brief: the agent's identity
 * is disclosed). `{mega}` is the family MEGA's name. */
export const PROPOSAL_DISCLOSURE = '{mega} · your family\u2019s MEGA (AI). Nothing changes until Admin approves.';
/** The line under the share suggestion and on private events (Screen 12). */
export const SHARE_RULE_COPY = 'MEGA never shares anything unless you tap Share.';

/** GD Screen 10 (Kids: homework, chores, routines, Mega Bucks). Wording from the boards; names are filled in. */
export const KIDS_COPY = {
  cameraTitle: 'Homework photo',
  cameraTip: 'Fit the whole page in the frame. {mega} reads it and makes practice for the kids.',
  cameraPrivacy: 'Only the grown-ups see homework photos.',
  takePhoto: 'Take the photo',
  choosePhoto: 'Choose a photo instead',
  cameraButton: 'Snap homework',
  uploading: 'Sending the photo…',
  cameraDenied: 'MEGA needs the camera to read homework. You can turn it on in Settings, or choose a photo instead.',
  sheetReading: 'Reading the worksheet…',
  sheetFailed: 'I couldn’t read that one. Try another photo?',
  makeTitle: 'Make practice for one of the kids?',
  makeBody: 'I’ll write new questions like these at their level. They get hints, never the answers.',
  forLabel: 'For',
  questionsLabel: 'Questions',
  make: 'Make practice',
  notNow: 'Not now',
  sent: 'Sent to {kid}. {mega} starts when they open it.',
  skipped: 'No practice this time.',
  drafting: 'Writing your questions…',
  practiceFrom: '{mega} · Practice',
  progress: 'Question {n} of {total}',
  finished: 'Finished',
  hintPlease: 'Hint, please',
  notQuite: 'Not quite. Want a hint?',
  notQuiteHinted: 'Not quite. Look at the hint and try again!',
  doneTitle: 'You got {correct} of {total}!',
  doneHints: 'You used {hints} hints.',
  doneHintsOne: 'You used 1 hint.',
  doneNoHints: 'No hints needed!',
  doneStatus: 'I told your grown-ups how it went.',
  summaryFrom: '{mega} → you · practice report',
  summaryTitle: '{kid} got {correct} of {total}',
  summaryWaiting: '{kid} hasn’t finished yet.',
  summaryStats: 'Hints used: {hints} · {minutes} min in all.',
  releaseFoot: 'Only grown-ups can release Mega Bucks.',
  release: 'Release {n}',
  releaseLater: 'Not now',
  releaseNotYet: 'Not yet',
  released: 'Released {n} Mega Bucks to {kid}. {mega} told them.',
  notReleased: 'Not released. You can do it later from {kid}’s page.',
  stepperLabel: 'Mega Bucks',
  fewer: 'Fewer',
  more: 'More',
  choreFrom: '{mega} · Chore',
  choreBody: 'When a grown-up checks, you get {n} Mega Bucks.',
  choreDone: 'Done!',
  choreSnooze: 'In 10 min',
  choreSnoozed: 'Okay! I’ll remind you again at {time}.',
  choreClaimed: 'Nice work! I told your grown-ups. Your Mega Bucks come when they check.',
  choreApproved: 'Checked! {n} Mega Bucks are yours.',
  choreDeclinedKid: 'A grown-up says not yet. Give it another go!',
  choreApproveFrom: '{mega} → you · chore',
  choreApproveTitle: '{kid} says “{chore}” is done',
  choreApproveBody: 'Marked done at {time}. You set this chore at {n} Mega Bucks.',
  choreDeclined: 'Not yet. {mega} will tell {kid} you’ll check again.',
  bedtimeFrom: '{mega} · Tomorrow',
  bedtimeTitle: 'Get ready for tomorrow',
  bedtimeTitleEvent: '{event} tomorrow',
  bedtimeTitleEventAt: '{event} tomorrow at {time}',
  bedtimeBody: 'Pack your bag tonight so the morning is easy. {n} of {total} packed.',
  bedtimeAllPacked: 'All packed! Sleep well.',
  morningFrom: '{mega} · Morning',
  morningCardTitle: 'Your morning, one step at a time',
  morningOpen: 'Start my morning',
  morningGreeting: 'Good morning, {kid}!',
  morningAllSet: 'All set, {kid}!',
  morningStep: 'Step {n} of {total}',
  morningDoneButton: 'Done!',
  morningStartOver: 'Start over',
  morningFinishedTitle: 'Have a great day!',
  morningFinishedCount: 'All done!',
  morningCheers: ['Nice!', 'Woo!', 'Yes!', 'All set!'],
  bucksTitle: '{by} released {n} Mega Bucks!',
  bucksForPractice: 'For your practice. Nice work!',
  bucksForChore: 'For your chore. Nice work!',
  bucksForBonus: 'Just because. Nice work!',
  bucksYouHave: 'You have {n} Mega Bucks',
  openStore: 'Open the Store',
  later: 'Later',
  loading: 'Loading…',
  notReady: 'This isn’t ready yet. Check back in a bit.',
} as const;

/** GD Screen 11 (the Store). */
export const STORE_COPY = {
  title: 'Store',
  roomStore: 'Store · {n}',
  youHave: 'You have {n} Mega Bucks',
  earnMore: 'Earn more with chores and practice.',
  decorate: 'Decorate',
  openStore: 'Open the Store',
  tryingOn: 'Trying on',
  wearingNow: 'Wearing now',
  wearing: 'Wearing',
  owned: 'Owned',
  free: 'Free',
  yours: 'Yours',
  classic: 'Classic',
  inRoom: 'In your room',
  wearIt: 'Wear it',
  needMore: 'Need {n} more',
  needNote: 'Earn Mega Bucks with chores and practice. A grown-up releases them.',
  buyFor: 'Buy for {n}',
  afterNote: 'You have {have}. You’d have {left} left.',
  confirmTitle: 'Buy {item}?',
  confirmBody: '{price} Mega Bucks. You’ll have {left} left.',
  buyIt: 'Buy it',
  notNow: 'Not now',
  boughtTitle: 'It’s yours!',
  boughtFurniture: 'Find the {item} in Decorate and put it anywhere in your room.',
  boughtLook: '{mega} is wearing the {item}. You can switch back any time.',
  decorateNow: 'Decorate now',
  keepShopping: 'Keep shopping',
  done: 'Done',
  trayTitle: 'Your furniture · tap to add',
  trayNew: 'NEW',
  inRoomTag: 'In room',
  kidsOnly: 'The Store is for kids. Grown-ups’ MEGAs can wear anything for free.',
  unavailable: 'The Store isn’t open yet. Check back soon!',
  noun: { furniture: '', stickers: ' sticker', colors: ' color', antennas: ' antenna', eyes: ' eyes' } as Record<string, string>,
  roomPlaceholder: 'Your room’s tile map arrives with HQ in G5. Your furniture is saved and shows up there.',
} as const;

/** GD Screen 12 (Calendar layers, sharing, clashes, gift ideas). `{hub}` is the family MEGA's name. */
export const CALENDAR_COPY = {
  household: 'Household',
  onlyYou: 'Only you',
  today: 'Today',
  nothingPlanned: 'Nothing planned.',
  whoHousehold: '{who} · Household',
  whoPrivate: '{who} · Only you',
  whoShared: '{who} · Shared',
  allDay: 'All day',
  until: 'to {time}',
  you: 'You',
  clashTag: 'CLASH',
  clashBanner: '{hub} spotted a clash',
  seeFix: 'See the fix',
  privateNote: 'Private events stay on your calendar. Nobody else sees them, and {hub} never checks them for clashes.',
  shareFrom: '{mega}',
  shareTitle: 'Share it with the household?',
  shareBody: 'Everyone in the household would see “{preview}”. Right now it’s only on your calendar.',
  shareIt: 'Share it',
  keepPrivate: 'Keep private',
  shared: 'Shared with the household. {hub} can plan around it now.',
  kept: 'Kept private. Only you see it.',
  shareExpired: 'This suggestion expired. Nothing was shared.',
  proposalFrom: '{hub} · your family’s MEGA',
  aiTag: 'AI',
  now: 'Now',
  afterApprove: 'After you approve',
  approve: 'Approve',
  reject: 'Reject',
  waitingAdmin: 'Waiting for Admin (you) to approve. Nothing has changed yet.',
  waitingOther: 'Waiting for Admin to approve. Nothing has changed yet.',
  approved: 'Approved by {name}. The calendar is updated.',
  rejected: 'Rejected. Nothing changed.',
  expired: 'This fix expired. Nothing changed.',
  stale: 'The family changed since this was suggested, so nothing changed.',
  proposalFoot: '{hub} only checks household events. Private ones are never looked at.',
  giftsTitle: 'Gift ideas for {name}',
  giftsBasedOn: 'Based on what’s shared',
  giftsAdd: 'Add to list',
  giftsAdded: 'Added',
  giftsQueued: 'Finding ideas…',
  giftsFailed: 'I couldn’t come up with ideas this time.',
  giftsFoot: 'Only shared info is used. Private notes stay private.',
} as const;

/** The sign-in screens (Screen 9 boards, approved Oct 26; wordmark and tagline Oct 27). The wordmark and the
 * one tagline come from IDENTITY (shared/config/identity.ts), never repeated here. */
export const SIGNIN_COPY = {
  welcome: { make: 'Make my MEGA', invite: 'I have an invite', haveAccount: 'Already have an account?', signIn: 'Sign in', demo: 'Demo', hubLabel: 'Hub, your family’s MEGA' },
  /** The shared loader (src/features/walkers/MegaLoader.tsx): a MEGA pacing on top of the words. */
  loader: { opening: 'Opening chats' },
  /** The sign-in sheet (LoginSheet / LoginCreate boards, Oct 28): Apple, Google, then email + password. */
  sheet: {
    titleSignIn: 'Welcome back',
    titleCreate: 'Create your account',
    tabsLabel: 'Sign in or create an account',
    tabSignIn: 'Sign in',
    tabCreate: 'Create account',
    apple: 'Continue with Apple',
    google: 'Continue with Google',
    orEmail: 'or use email',
    email: 'Email',
    password: 'Password',
    show: 'Show',
    hide: 'Hide',
    submitSignIn: 'Sign in',
    submitCreate: 'Create account',
    submitSignInLabel: 'Sign in with email',
    submitCreateLabel: 'Create account with email',
    forgot: 'Forgot password?',
    // PLACEHOLDER: reset by email needs an email provider (AUTH.passwordResetByEmail is off).
    forgotSoon: 'Reset by email is coming soon. Ask your family admin for help.',
    rule: (n: number) => `Use ${n} or more characters.`,
    badEmail: 'That email doesn’t look right.',
    tooShort: (n: number) => `Passwords need ${n} or more characters.`,
    privacy: 'MEGA only gets your name and email.',
    close: 'Close',
  },
  demo: { title: 'Demo accounts', badge: 'Dev builds only', sub: (megaName: string, role: string) => `${megaName} · ${role}` },
  invite: {
    title: 'I have an invite',
    // QR scanning is designed (LoginScan board) and built with expo-camera in G8; until then, paste only.
    body: 'Paste the link your family admin sent you, or just its code.',
    label: 'Invite link',
    placeholder: 'mega.family/join/…',
    example: 'Looks like mega.family/join/7QK2-M4XD, or just 7QK2-M4XD',
    cont: 'Continue',
    back: 'Back',
    or: 'or',
    helpTitle: 'No link yet?',
    helpBody: 'Ask your family admin to open Family in their MEGA app and tap Invite. They can text you the link.',
  },
  /** Adult and kid invites are different screens, picked from the invite (LoginPreview / LoginPreviewKid). */
  join: {
    invitedBy: (name: string) => `${name} invited you`,
    loading: 'Opening your invite',
    adultTitle: 'Join the family',
    adultBody: (inviter: string) => `${inviter} made a MEGA for you. Keep it, or change it to make it yours.`,
    adultMegaSub: (personality: string, inviter: string) => `Your MEGA · ${personality.toLowerCase()} · picked by ${inviter}`,
    alreadyHere: 'Already here',
    keep: 'Looks good, join',
    change: 'Change my MEGA',
    changeTitle: 'Make it yours',
    nameLabel: 'Name',
    done: 'Done',
    kidTitle: (mega: string) => `${mega} is ready to meet you!`,
    kidBody: (inviter: string, mega: string) => `${inviter} made ${mega} just for you.`,
    grownUpTitle: 'Grown-up step',
    grownUpBody: (mega: string) => `Ask a grown-up to type the 5-digit parent code. Then you and ${mega} can say hi.`,
    grownUpHere: 'A grown-up is here',
    codeTitle: 'Parent code',
    codeBody: 'Grown-ups: type the 5-digit parent code from your MEGA app.',
    codeLabel: 'Parent code',
    codePlaceholder: '5 digits',
    codeJoin: 'Join the family',
    greeting: 'Welcome!',
  },
  expired: {
    eyebrow: (name: string) => `Invite from ${name}`,
    title: 'This invite expired',
    body: (name: string, days: number) => `Invites last ${days} days. Ask ${name} to send you a new one.`,
    hubAsleep: 'Hub, the family’s MEGA, asleep',
    action: 'Use a new invite',
  },
  invalid: { title: 'That invite didn’t work', body: 'Check the link, or ask your family admin to send a new one.', action: 'Try another link' },
  locked: { title: 'This invite is locked', body: 'The parent code was wrong 5 times. Ask a grown-up to send you a new invite.', action: 'Use a new invite' },
  family: {
    title: 'Let’s set up your family',
    body: 'You’re signed in. Start a new family, or join the one that invited you.',
    start: 'Start a family',
    startBody: 'Make your MEGA, then add everyone.',
    join: 'Join a family',
    joinBody: 'Use the invite link from your family’s admin.',
  },
  differentAccount: { prompt: 'Not you?', action: 'Use a different account' },
  sayHi: (name: string) => `Hi! I’m ${name}.`,
  sayHiLabel: (name: string) => `${name}, say hi`,
  failed: 'Something went wrong. Try again.',
} as const;

/** GD backend: the deterministic headline + body for each card-backed push (convex/model/proactive.ts
 * `enqueueCardCandidate`). The model already wrote the card's real content (a proposal, a practice set, gift
 * ideas); these are just the lock-screen line, so they're templates, not model calls. `{x}` slots are filled
 * with plain values from the row (`fillCopy`). */
export const GD_PUSH_COPY = {
  choreRemind: { title: '{chore}', text: 'Time for {chore}. Tap Done when it’s finished.' },
  choreApprove: { title: '{kid} finished {chore}', text: '{kid} says {chore} is done. Release {bucks} Mega Bucks?' },
  practiceReady: { title: 'Practice time', text: '{topic} practice is ready. {count} questions. You’ve got this!' },
  practiceSummary: { title: '{kid} finished practice', text: '{kid} got {correct} of {total}. {note}' },
  bucksReleased: { title: '{bucks} Mega Bucks!', text: '{by} released {bucks} Mega Bucks. You have {balance} now.' },
  routineMorning: { title: 'Good morning', text: 'Your morning list is ready. One step at a time.' },
  routineBedtime: { title: 'Ready for tomorrow?', text: 'A few things to get ready for tomorrow.' },
  shareSuggestion: { title: 'Share with the household?', text: '{preview}. Right now only you can see it.' },
  proposal: { title: '{title}', text: '{text}' },
  proposalApplied: { title: 'Calendar updated', text: '{title}. Approved by {by}.' },
  gifts: { title: 'Gift ideas for {name}', text: '{name}’s birthday is {when}. Here are a few ideas from what’s been shared.' },
} as const;

/** Fills `{key}` slots in a GD_PUSH_COPY template. Unknown slots become empty, never "undefined". */
export function fillCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (values[k] === undefined ? '' : String(values[k]))).trim();
}

/** The adults-scope list `gifts.addToList` adds to (created on first use). */
export const GIFT_LIST_NAME = 'Gift ideas';
