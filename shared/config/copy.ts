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
  /** A parent's read-only view of a kid's chat (Family → kid): loading, and a kid who hasn't chatted yet. */
  kidThreadOpening: 'Opening their chat…',
  kidThreadEmpty: '{name} hasn’t chatted with their MEGA yet.',
} as const;

/** The chat composer's words (canvas v33 thread.html). `{mega}` is the MEGA's name. */
/** Words every modal shares (the ✕ button's label for screen readers). */
export const MODAL_COPY = { close: 'Close' } as const;

/** The MEGA profile (Profile board; owner, Oct 28: tapping the MEGA opens customizing and profile concerns). */
export const PROFILE_COPY = {
  title: 'MEGA profile',
  rename: (name: string) => `Rename ${name}`,
  nameLabel: 'MEGA name',
  save: 'Save',
  lookTitle: 'Look & personality',
  lookLabel: 'Look and personality',
  shares: (name: string) => `What ${name} shares`,
  you: 'You',
  notifications: 'Notifications and quiet hours',
  notificationsHint: 'What wakes your phone, and when it stays quiet',
  theme: 'Theme',
  themeHint: 'Dark or light, and your color',
  remembers: (name: string) => `What ${name} remembers`,
  remembersHint: 'Search and forget',
} as const;

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
  /** G4 invariant 1 (tool result to the model, not shown to the member): after a web search, changes wait for the member. */
  actAfterSearchRefusal: "Not done: search results can't trigger changes by themselves. Tell the member what you found and ask if they want you to do it; act only after they confirm.",
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
  /** Read out by screen readers while a card's first load shows its skeleton (never shown as text). */
  loadingLabel: 'Getting this ready',
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

/** G4 Screen 14 (boards Integrations, SearchKid*, Weather*, Travel*, Places*, PlaceSheet, SearchLog, EventPlace).
 * The fail-closed lines ("Travel time isn't set up yet.") stay in INTEGRATION_COPY (./integrations.ts); the
 * kid blocked answer stays KID_SAFETY.blockedMessage (./kidSafety.ts). `{x}` slots are filled with fillCopy. */
export const G4_COPY = {
  searchFrom: '{mega} looked it up',
  searchRephrased: 'I looked up something close to that instead.',
  searchQuoted: '“{text}”',
  searchSources: 'Sources',
  searchKidBlockedNote: 'Your grown-ups can see searches like this one.',
  searchOpenSource: '{title}, {domain}',
  weatherLabel: 'Weather for {place}',
  weatherNow: '{place} · now',
  weatherHighLow: 'High {high}° · Low {low}°',
  weatherSourceForecast: 'Open-Meteo',
  weatherSourceAlert: 'National Weather Service',
  weatherAlertTitle: '{event} · {severity}',
  weatherAlertUntil: 'Until {time}',
  weatherRain: '{pct}%',
  travelFrom: '{mega} · Travel',
  travelLeaveBy: 'Leave by {time}',
  travelMinutes: '{minutes} min with traffic (usually {typical})',
  travelMinutesNoTypical: '{minutes} min with traffic',
  /** The minutes line when the card knows its event (v0.15a `eventTitle`). */
  travelWithEvent: '{line} · {event}',
  travelNotSetUpBody: 'I can’t check traffic until your family admin turns on travel time, so I won’t guess a leave-by time.',
  /** TravelNotSetUp with the event known (v0.15a `eventTitle` + `eventStart`). */
  // "{event} at {time}", never "starts at": titles can be phrases like "Soccer practice ends" (G4 review).
  travelNotSetUpBodyEvent: '{event} at {time}. I can’t check traffic until your family admin turns on travel time, so I won’t guess a leave-by time.',
  travelOnMyWay: 'On my way',
  travelSnooze: 'Snooze 5 min',
  travelRemind30: 'Remind me 30 min before',
  travelNoRoute: 'I couldn’t find a route there. Check the place’s address under Family → Places.',
  travelTryLater: 'I couldn’t check traffic right now. I’ll try again soon.',
  placesTitle: 'Places',
  placesIntro: 'Home, school, work and other places your family goes. MEGA uses them for “leave by” times and weather.',
  placesIntroKid: 'Places your family uses for travel time and weather.',
  placesNone: 'Add home first. MEGA uses it for “leave by” times and the weather.',
  placesNoneKid: 'A grown-up hasn’t added any places yet.',
  placesAdd: 'Add a place',
  placesEdit: 'Edit',
  placesEditLabel: 'Edit {label}',
  placesReadOnly: 'Set by a grown-up',
  placesFoot: 'Places are shared with the household. MEGA uses them for travel time and weather, never your phone’s location.',
  placeStatus: {
    ok: 'Found on the map',
    seed: 'Found on the map',
    pending: 'Looking it up…',
    failed: 'Couldn’t find it · check the address',
    not_configured: 'Saved · map lookup isn’t set up yet',
  },
  placeSheetAdd: 'Add a place',
  placeSheetEdit: 'Edit place',
  placeName: 'Name',
  placeKind: 'Kind',
  /** The PlaceSheet's kind picker (the stored default label for `other` is PLACES.labels.other). */
  placeKinds: { home: 'Home', school: 'School', work: 'Work', other: 'Other' },
  placeAddress: 'Address',
  placeSave: 'Save',
  placeRemove: 'Remove',
  placeNeedName: 'Give the place a name.',
  placeNeedAddress: 'Add an address so MEGA can find it.',
  close: 'Close',
  searchesTitle: '{kid} · Searches',
  searchesToggle: 'Tell me about blocked searches',
  searchesToggleOn: 'Kid controls · on',
  searchesToggleOff: 'Kid controls · off',
  searchesOff: 'Turn this on to see the searches MEGA blocked or changed for {kid}.',
  searchesNone: 'Nothing blocked or changed yet. {kid}’s searches have all been fine.',
  searchesFoot: 'Searches that went through normally aren’t listed here. {kid} sees a note on the card when a search is blocked.',
  searchesButton: 'Searches',
  searchesTagBlocked: 'Blocked',
  searchesTagChanged: 'Changed',
  searchesBlockedWhat: '{kid} saw “{message}” Nothing was searched.',
  searchesChangedWhat: 'Searched instead: “{text}”.',
  eventPlaceTitle: 'Event place',
  eventPlaceWhere: 'Where',
  eventPlaceSaved: 'Saved place · travel time and weather',
  eventPlaceSavedShort: 'Saved place',
  eventPlaceText: 'Type a place instead',
  eventPlaceTextSub: 'Just text, no travel time',
  eventPlaceFoot: 'A saved place gets travel time and weather. Typed-in places are just text.',
  eventPlaceSave: 'Save',
  eventPlaceAddFirst: 'No saved places yet. Add them under Family → Places.',
  failedSave: 'That didn’t save. Try again?',
} as const;

/** G4b (CONTRACT v0.16): shopping, price watch, air quality and UV, holidays. `{…}` placeholders via `fillCopy`.
 * Cards are drawn on the canvas row "Screen 15 · Shopping, air and holidays". */
export const G4B_COPY = {
  productsFrom: '{mega} · Shopping',
  productsFor: 'For “{query}”',
  productPrice: '{price}',
  productWas: 'was {price}',
  productOutOfStock: 'Out of stock',
  productOpen: 'Open in store',
  productStore: 'Sold by {store}',
  productsFoot: 'Prices from Shopify stores, checked just now. MEGA never buys anything.',
  productsLoading: 'Checking prices…',
  productsNone: 'I couldn’t find anything for that. Try different words?',
  productsUnavailable: 'I can’t check stores right now. Try again in a bit?',
  giftsProducts: 'In stores now',
  giftsWatching: 'Watching the price',
  priceDropTitle: 'Price drop · {title}',
  priceDropBody: '{title} dropped to {price} (was {was}). {who}’s birthday is in {days} days.',
  priceDropBodyToday: '{title} dropped to {price} (was {was}).',
  priceStopWatching: 'Stop watching',
  priceStopped: 'Stopped watching {title}.',
  airUv: 'UV {uv}',
  airAqi: 'Air {aqi}',
  uvLevels: { low: 'Low', moderate: 'Moderate', high: 'High', veryHigh: 'Very high', extreme: 'Extreme' },
  aqiLevels: {
    good: 'Good',
    moderate: 'Moderate',
    sensitive: 'Unhealthy for sensitive groups',
    unhealthy: 'Unhealthy',
    veryUnhealthy: 'Very unhealthy',
    hazardous: 'Hazardous',
  },
  tipUv: 'UV is high during {event}. Pack sunscreen.',
  tipAir: 'Air quality is poor during {event}. Maybe keep it short or indoors.',
  airSource: 'Open-Meteo air quality',
  /** The weather sentence the MEGA is given (and the card summary): numbers from the provider, words from the bands. */
  sentenceAqi: 'air quality US AQI {aqi} ({level})',
  sentenceUv: 'UV {uv} ({level}) at today’s peak',
  holidayMarker: '{name}',
  holidayQuestionTitle: '{day} is {name}',
  holidayQuestion: '{day} is {name}. Pause the morning routine and chores for {kids}?',
  holidayWhy: 'Holidays don’t always mean no school, so I’m asking instead of guessing.',
  holidayPause: 'Pause for the day',
  holidayKeep: 'Keep as usual',
  holidayPaused: 'Paused for {day} by {by}. Bedtime prep will say there’s no school routine.',
  holidayKept: 'Kept as usual for {day} by {by}.',
  bedtimeNoRoutine: 'No school routine tomorrow. Enjoy {name}!',
} as const;

/** G4b frontend (Screen 15 boards): the card labels, a11y text and notes the app draws around G4B_COPY's lines.
 * `{…}` placeholders via `fillCopy`. */
export const G4B_UI_COPY = {
  giftsFrom: '{mega} · Gift ideas',
  giftsNoCatalog: 'Store prices aren’t set up yet, so these are web links without prices. I won’t guess what things cost.',
  /** Board GiftsProducts footer (store products shown); GiftsNoCatalog keeps CALENDAR_COPY.giftsFoot. */
  giftsProductsFoot: 'Only shared info is used. I’ll tell you if a price drops on something you add. I never buy anything.',
  /** The calendar's week pager (no board draws one; G4b UX review: the holiday marker was unreachable). */
  weekPrev: 'Previous week',
  weekNext: 'Next week',
  giftsLinkNoPrice: '{domain} · no price checked',
  giftsWatchingLabel: 'Watching the price of {title}',
  productOpen: 'Open',
  productOpenLabel: 'Open {title} at {store}',
  productNoPicture: 'No picture from the store',
  productPhoto: 'Product photo: {title}',
  productOutOfStockLabel: '{title}, out of stock',
  productsNotSetUp: 'Store search isn’t set up yet.',
  productsNotSetUpBody: 'I can’t check stores or prices until your family admin turns it on, so I won’t guess.',
  priceDropFrom: '{mega} · Price drop',
  priceWas: 'Was',
  priceNow: 'Now',
  priceDropFoot: 'Only grown-ups get price alerts. {who} never sees them, so the gift stays a surprise.',
  priceDropFootNoName: 'Only grown-ups get price alerts, so the gift stays a surprise.',
  priceStoppedBy: 'Stopped watching. I won’t check this price again.',
  airUvTile: 'UV · max today',
  airAqiTile: 'Air quality',
  airAqiUnit: 'US AQI now',
  airUvNow: 'Now {uv}',
  airUvLabel: 'UV index {uv}, {level}',
  airAqiLabel: 'Air quality index {aqi}, {level}',
  tipUvFrom: '{mega} · UV',
  tipAirFrom: '{mega} · Air quality',
  tipUvWhen: 'UV index at the start',
  tipAirWhen: 'US AQI at the start',
  holidayFrom: '{mega} · Tomorrow',
  holidayFor: 'For {kids}',
  holidayFoot: 'Asked once, the evening before. Only grown-ups can pause routines.',
  holidayBanner: '{name} · public holiday',
  holidayBannerPaused: 'The morning routine and chores are paused for the day.',
  holidayBannerKept: 'Routines and chores are on as usual.',
  holidayDayLabel: '{day}, {name}',
  holidayNote: 'Public holidays come from a holiday calendar. School closures still come from the school’s own calendar link.',
  someone: 'A grown-up',
  placeOutdoor: 'Outdoors',
  placeOutdoorHint: 'Events here get sunscreen and air-quality tips.',
} as const;

/** G5 (CONTRACT v0.17): the onboarding chat (canvas Screen 13, OnboardChat … OnboardNext), Settings → Connected
 * accounts, schedule links, the reconnect ask and the profiler's check questions. The server writes MEGA's
 * onboarding lines from here (deterministic, no model call); the app reads the rest. `{x}` slots via fillCopy. */
export const G5_COPY = {
  // Step 1 · name (OnboardChat)
  hello: 'Hi! I’m {mega}, your MEGA. I help you keep the family’s week on track, and I’ll get better the more I know.',
  askName: 'First things first: what should I call you?',
  namePlaceholder: 'What should I call you?',
  privateFoot: 'Everything I find stays private to you until you share it.',
  // Step 2 · named (OnboardChatNamed)
  niceToMeet: 'Nice to meet you, {name}! A couple of quick things and I can start helping right away.',
  // Step 3 · Gmail (OnboardGmail / OnboardGmailConnected)
  gmailTitle: 'Want me to watch your Gmail?',
  gmailBody: 'I’ll look for the things families miss: school emails, appointments, bills and deliveries. I only read; I never send, delete or reply.',
  gmailLooksFor: 'What I’d look for',
  gmailLooksForItems: ['School and teachers', 'Appointments', 'Bills and due dates', 'Deliveries'],
  gmailConnect: 'Connect Gmail',
  notNow: 'Not now',
  gmailConnected: 'Gmail connected · checking the last {days} days',
  gmailConnectedAs: 'Connected as {email}',
  gmailSkipped: 'Skipped. You can connect Gmail any time in Settings.',
  gmailTestingNote: 'Google will say this app isn’t verified yet. That’s expected while MEGA is in testing.',
  // Step 4 · found (OnboardGmailFound)
  foundIntro: 'I found {count} things worth keeping in your email.',
  foundIntroOne: 'I found one thing worth keeping in your email.',
  foundNone: 'Nothing needs you in the last {days} days. I’ll keep watching for new ones.',
  foundFrom: 'From your Gmail',
  foundFoot: 'Added items go on your private calendar. Only you see them.',
  foundRemove: 'Remove {title}',
  foundRemoved: 'Removed.',
  // share suggestion wording reuses the shareSuggestion card; these are its onboarding lines
  shareAsk: 'Share {title} with the household?',
  shareBody: '{who} would see “{title}”. Right now it’s only yours.',
  shareFoot: 'MEGA never shares anything unless you tap Share.',
  // Step 5 · calendar (OnboardCalendar)
  calendarTitle: 'Bring in your calendar?',
  calendarBody: 'I’ll add your events to your private calendar so I can plan around them. You choose what the household sees.',
  calendarGoogle: 'Google Calendar',
  calendarPhone: 'This phone’s calendar',
  calendarGoogleConnected: 'Google Calendar connected · {count} events this month',
  calendarPhoneConnected: 'Phone calendar added · {count} events this month',
  calendarSkipped: 'Skipped. You can add a calendar any time in Settings.',
  calendarPhoneWebOnly: 'Open MEGA on your phone to add its calendar.',
  calendarPhoneDenied: 'MEGA can’t see this phone’s calendar. You can allow it in the phone’s Settings.',
  // Step 6 · schedule links (OnboardIcs)
  icsTitle: 'Any schedule links?',
  icsBody: 'Schools and sports teams often share a calendar link (it ends in .ics). Paste one and I’ll keep it up to date.',
  icsPaste: 'Paste a link',
  icsPlaceholder: 'https://… .ics',
  icsAdded: 'Added “{title}” · updates every few hours',
  icsBad: 'That link didn’t work. It should start with https:// or webcal:// and end in .ics.',
  icsDone: 'I’ll keep watching for new ones.',
  icsSkipped: 'Skipped. You can add schedule links any time in Settings.',
  // Step 7 · family (OnboardNext → Screen 5 boards)
  familyIntro: 'All set. Now the fun part: who’s in your family?',
  familyAsk: 'Who should I add first?',
  familyBody: 'I’ll make each person their own MEGA. Grown-ups can change theirs; kids get the one you pick.',
  familyKid: 'A kid',
  familyOther: 'Someone else',
  familyJustMe: 'Just me for now',
  familyLater: 'You can add people any time from Family.',
  personName: 'What’s their name?',
  personRelationship: 'Who is {name} to you?',
  personGetsMega: 'Should {name} get a MEGA?',
  personDone: 'Add someone else',
  personAllDone: 'That’s everyone',
  // Settings → Connected accounts (board needed: SettingsAccounts)
  accountsTitle: 'Connected accounts',
  accountsFoot: 'MEGA only reads. Everything it finds is private to you until you share it.',
  accountConnected: 'Connected',
  accountNeedsReconnect: 'Needs you to sign in again',
  accountError: 'Couldn’t check lately',
  accountLastChecked: 'Checked {ago}',
  accountDisconnect: 'Disconnect',
  accountDisconnected: 'Disconnected. I stopped reading {what} and removed what I found.',
  accountReconnect: 'Reconnect',
  accountAddIcs: 'Add a schedule link',
  // Reconnect ask in chat (board needed: Reconnect)
  reconnectTitle: 'Google needs you to sign in again',
  reconnectBody: 'While MEGA is in testing, Google asks again every 7 days. Until then I can’t check {what}.',
  // Profiler check questions (choice block)
  checkYes: 'Yes',
  checkNo: 'Not anymore',
  checkSkip: 'Skip',
} as const;
