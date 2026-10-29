// CONTRACT §2. The fields of every table. convex/schema.ts adds indexes; `returns` validators reuse these.
// Every family-owned table has familyId, and no query may read across families.
import { type Infer, v } from 'convex/values';
import {
  delivery,
  learningTrigger,
  loudness,
  megaKind,
  memoryKind,
  notificationKind,
  personality,
  platform,
  reaction,
  relationship,
  role,
  scope,
  shareLevel,
  station,
  themeName,
  via,
} from './enums';
import { holiday, productRef } from './integrationShapes';
import { author, messageBody, saveChip } from './messages';
import {
  ALERT_SEVERITIES,
  ANTENNA_IDS,
  BUTTON_SET_IDS,
  EYE_COLOR_IDS,
  EYE_STYLE_IDS,
  GEOCODE_STATUSES,
  INTEGRATION_FAILURES,
  PLACE_KINDS,
  PRICE_WATCH_STATUSES,
  ROUTINE_KINDS,
  ROUTINE_SKIP_STATUSES,
  SEARCH_OUTCOMES,
  STICKERS,
  STORE_ITEM_IDS,
  WALLPAPER_PRESET_IDS,
  WEATHER_TIPS,
} from '../config/ids';
import { literals } from './validators';

// Config-backed values: stored as strings, but only ids that exist in shared/config are accepted.
export const stickerId = literals(STICKERS);
export const wallpaperPresetId = literals(WALLPAPER_PRESET_IDS);
export const buttonSetId = literals(BUTTON_SET_IDS);
export const antennaId = literals(ANTENNA_IDS);
export const eyeStyleId = literals(EYE_STYLE_IDS);
export const eyeColorId = literals(EYE_COLOR_IDS);
export const storeItemId = literals(STORE_ITEM_IDS);
export const routineKind = literals(ROUTINE_KINDS);

/** GD (CONTRACT v0.13, OpenDuet learning): what made a privacy/judge decision, for audit. Format
 * `rule:<ruleId>` (a deterministic rule in code/config) or `model:<modelId>` (a model call). Rules may only
 * ever make something MORE private (mark sensitive, hold, keep private); only a model verdict, or the
 * owner's own tap, can leave something less restricted. See docs/gates/GD.md -> invariants. */
export const decidedBy = v.string();
export type DecidedBy = `rule:${string}` | `model:${string}`;

const familyId = v.id('families');
const memberId = v.id('members');
/** "HH:MM", 24-hour, in the family's timezone. */
const clockTime = v.string();
/** "YYYY-MM-DD". */
const dateOnly = v.string();
const quietHours = v.object({ start: clockTime, end: clockTime });

// ---------- family and people ----------

export const families = {
  name: v.string(),
  timezone: v.string(),
  adminId: v.optional(memberId), // set right after the admin member is created
  parentCode: v.string(),
  createdAt: v.number(),
  /** v0.16 (G4b, optional): ISO 3166-1 alpha-2 country for public holidays; HOLIDAYS.defaultCountry when empty. */
  country: v.optional(v.string()),
};

export const members = {
  familyId,
  name: v.string(),
  role,
  authId: v.optional(v.string()),
  birthday: v.optional(dateOnly),
  grade: v.optional(v.string()),
  activities: v.array(v.string()),
  hasMega: v.boolean(),
  joinedAt: v.optional(v.number()),
};

export const relationships = { familyId, from: memberId, to: memberId, kind: relationship };

/** GD (v0.13, additive): `antenna`, `eyes` and `eyeColor` are optional; missing means `classic`. A kid may
 * only wear parts they own (shared/config/store.ts STORE_RULES); `megas.update` checks it on the server. */
export const megaLook = v.object({
  hex: v.string(),
  sticker: stickerId,
  antenna: v.optional(antennaId),
  eyes: v.optional(eyeStyleId),
  eyeColor: v.optional(eyeColorId),
});
export const megaJob = v.object({ station, label: v.string(), busy: v.boolean(), since: v.number() });

export const megas = {
  familyId,
  kind: megaKind,
  ownerId: v.optional(memberId),
  name: v.string(),
  look: megaLook,
  personality,
  job: megaJob,
};

/** Screen 9 redesign (CONTRACT v0.14, additive): the MEGA an invite comes with — the one the admin set for
 * the person (or a default). An adult can keep it or change it when joining; a kid can't. */
export const inviteMega = v.object({ name: v.string(), look: megaLook, personality });

export const invites = {
  familyId,
  memberId,
  tokenHash: v.string(),
  expiresAt: v.number(),
  redeemedAt: v.optional(v.number()),
  /** v0.14 (additive): who sent it ("Admin invited you"). */
  invitedBy: v.optional(memberId),
  /** v0.14 (additive): the MEGA this person gets on joining (see `inviteMega`). */
  mega: v.optional(inviteMega),
  // CONTRACT.md v0.4 (additive, pending approval): wrong-parent-code attempts for this invite, so
  // `invites.redeem` can lock it out — see shared/config/limits.ts `maxParentCodeAttempts`.
  failedAttempts: v.optional(v.number()),
};

export const grants = { familyId, ownerId: memberId, granteeIds: v.array(memberId), label: v.string() };

export const sharing = { familyId, memberId, schedule: shareLevel, lists: shareLevel, hqActivity: shareLevel };

export const kidControlsFields = {
  homeworkMode: v.boolean(),
  quietHours,
  dailyMinutes: v.optional(v.number()),
  blockedTopics: v.array(v.string()),
  tellsParents: v.object({
    safety: v.literal(true),
    blockedSearches: v.boolean(),
    summary: v.union(v.literal('none'), v.literal('daily'), v.literal('weekly')),
  }),
  parentsCanReadChat: v.boolean(),
  webSearch: v.boolean(),
};
export const kidControls = { familyId, memberId, ...kidControlsFields };

export const accent = v.union(v.literal('theme'), v.literal('mega'), v.object({ hex: v.string() }));
export const wallpaper = v.union(
  v.object({ kind: v.literal('preset'), id: wallpaperPresetId }),
  v.object({ kind: v.literal('photo'), storageId: v.id('_storage') }),
  v.object({ kind: v.literal('generated'), imageId: v.id('images') }),
  v.null(),
);
export const notifyPrefs = v.object({ loudKinds: v.array(notificationKind), quietHours, dailyCap: v.number() });
export const pushToken = v.object({ token: v.string(), platform });

export const settings = {
  familyId,
  memberId,
  theme: themeName,
  accent,
  wallpaper,
  notify: notifyPrefs,
  pushTokens: v.array(pushToken),
};

// ---------- chat ----------

// v0.13b (additive): `startedAt` — when `chat.start` handled this thread's first open (wrote the MEGA's
// starter, or found the member already talking), so a starter is written at most once per thread.
export const threads = { familyId, ownerId: memberId, megaIds: v.array(v.id('megas')), lastAt: v.number(), startedAt: v.optional(v.number()) };

export const messages = {
  familyId,
  threadId: v.id('threads'),
  at: v.number(),
  author,
  via,
  body: messageBody,
  streamId: v.optional(v.string()),
  chips: v.array(saveChip),
  reaction: v.optional(reaction),
  fromNotificationId: v.optional(v.id('notifications')),
};

// ---------- memory and learning ----------

export const memorySource = v.object({
  kind: v.union(v.literal('message'), v.literal('onboarding'), v.literal('integration'), v.literal('admin'), v.literal('profiler')),
  ref: v.optional(v.string()),
});

export const memories = {
  familyId,
  scope,
  scopeKey: v.string(),
  about: v.array(memberId),
  kind: memoryKind,
  text: v.string(),
  data: v.optional(v.any()),
  source: memorySource,
  trigger: learningTrigger,
  confidence: v.number(),
  confirmed: v.boolean(),
  sensitive: v.boolean(),
  validUntil: v.optional(v.number()),
  supersedes: v.optional(v.id('memories')),
  pinned: v.boolean(),
  createdAt: v.number(),
  lastUsedAt: v.number(),
  /** GD (v0.13, additive): which rule or model decided `sensitive` (convex/model/concernGate.ts). */
  gate: v.optional(v.object({ decidedBy, reason: v.optional(v.string()) })),
};

export const reactionCounts = v.object({ sent: v.number(), answered: v.number(), ignored: v.number(), up: v.number(), down: v.number() });

export const profiles = {
  familyId,
  memberId,
  callMe: v.string(),
  basics: v.record(v.string(), v.string()),
  routines: v.array(v.object({ text: v.string(), days: v.array(v.number()), time: v.optional(clockTime), confirmed: v.boolean() })),
  /** Superseded by the family-level `places` table (G4, CONTRACT v0.15): home/school/work are household data,
   * not per-member. Kept (always `[]`) so existing rows stay valid; nothing reads or writes it. */
  places: v.array(v.object({ label: v.string(), address: v.string(), lat: v.number(), lng: v.number() })),
  proactive: v.object({ reminder: reactionCounts, request: reactionCounts, tip: reactionCounts, update: reactionCounts }),
  checkQuestions: v.array(v.object({ memoryId: v.id('memories'), question: v.string(), askAfter: v.number() })),
};

// ---------- plans and lists ----------

export const events = {
  familyId,
  title: v.string(),
  start: v.number(),
  end: v.optional(v.number()),
  allDay: v.optional(dateOnly),
  who: v.array(memberId),
  place: v.optional(v.string()),
  source: v.union(v.literal('mega'), v.literal('ics'), v.literal('device')),
  externalId: v.optional(v.string()),
  createdBy: v.optional(memberId),
  scope,
  cancelled: v.boolean(),
  /** GD (v0.13, additive): the owner of a private-layer event (`scope: 'personal'`), the only member who
   * can see or share it. The server sets it on every new personal event; older personal rows fall back to
   * `createdBy`. Unused on household events. See shared/config/calendar.ts LAYER_OF_SCOPE. */
  ownerId: v.optional(memberId),
  /** G4 (v0.15, additive): the family place the event happens at (travel time, weather). `place` stays the
   * free-text location ("Parade Ground, field 3"); `placeId` is set when it matches a saved place. */
  placeId: v.optional(v.id('places')),
};

export const reminders = {
  familyId,
  forMemberId: memberId,
  text: v.string(),
  dueAt: v.number(),
  eventId: v.optional(v.id('events')),
  done: v.boolean(),
  createdBy: v.optional(memberId),
};

export const lists = { familyId, name: v.string(), scope, ownerId: v.optional(memberId) };
export const listItems = { familyId, listId: v.id('lists'), text: v.string(), checked: v.boolean(), addedBy: v.optional(memberId), at: v.number() };

// ---------- proactive and notifications ----------

export const FAMILY_EVENT_TYPES = [
  'said',
  'calendar.changed',
  'list.changed',
  'reminder.due',
  'weather.alert',
  'notification.answered',
  'clock.tick',
  'job.changed',
] as const;

export const familyEvents = {
  familyId,
  at: v.number(),
  type: v.union(...FAMILY_EVENT_TYPES.map((t) => v.literal(t))),
  payload: v.any(),
  processed: v.object({ memory: v.boolean(), profiler: v.boolean(), triggers: v.boolean() }),
};

export const button = v.object({ id: v.string(), label: v.string() });
export type Button = Infer<typeof button>;

/** Which trigger produced a candidate (PLAN.md -> Proactive engine "Trigger -> candidate"), so the delivery
 * step can re-check "does this still apply" (e.g. a reminder already marked done) and the answer-effects
 * dispatcher (convex/model/notificationEffects.ts) knows which real row a button tap should act on. */
export const candidateSource = v.union(
  v.object({ kind: v.literal('reminder'), reminderId: v.id('reminders') }),
  v.object({ kind: v.literal('request'), requestId: v.id('requests') }),
  v.object({ kind: v.literal('checkin'), memberId }),
  v.object({ kind: v.literal('mattersTo'), fromMemberId: memberId, familyEventId: v.id('familyEvents') }),
  // GD (v0.13, internal only): card-backed triggers. Each one's thread message is its own GD card (§3)
  // instead of a `notification` card, and its push (if any) goes through the same timing/cap/quiet-hours
  // pipeline as everything else (convex/model/proactive.ts `enqueueCardCandidate`).
  v.object({ kind: v.literal('chore'), claimId: v.id('choreClaims') }),
  v.object({ kind: v.literal('routine'), runId: v.id('routineRuns') }),
  v.object({ kind: v.literal('proposal'), proposalId: v.id('proposals') }),
  v.object({ kind: v.literal('shareSuggestion'), suggestionId: v.id('shareSuggestions') }),
  v.object({ kind: v.literal('practice'), setId: v.id('practiceSets') }),
  v.object({ kind: v.literal('gifts'), giftIdeasId: v.id('giftIdeas') }),
  v.object({ kind: v.literal('bucks'), ledgerId: v.id('bucksLedger') }),
  // G4 (v0.15, internal only). Leave-by reminders (a `reminder`-kind push with the `reminder.default` buttons,
  // board Push "Soccer pickup in 10 minutes · Leave by 4:50"), weather alerts (NWS, `update` kind) and an
  // event's weather tip ("Rain at pickup", `tip` kind). All go through the normal judge/timing/caps.
  v.object({ kind: v.literal('leaveBy'), eventId: v.id('events'), checkId: v.id('travelChecks') }),
  v.object({ kind: v.literal('weatherAlert'), alertId: v.string(), placeId: v.id('places') }),
  // v0.16 (G4b): `tip` says which (rain/uv/air); absent means rain (G4's only tip).
  v.object({ kind: v.literal('weatherEvent'), eventId: v.id('events'), tip: v.optional(literals(WEATHER_TIPS)) }),
  // G4 backend addendum (v0.15a, internal only): a quiet notice to a kid's parents that the kid filter blocked
  // or rephrased a search (KID_SAFETY / kidControls.tellsParents.blockedSearches). Always a statement, never a push.
  v.object({ kind: v.literal('searchNotice'), searchLogId: v.id('searchLog') }),
  // G4b (v0.16, internal only): a watched gift's price dropped (an `update` to adults who can see the gift ideas,
  // never the recipient), and the evening-before-a-holiday question (a `request` to adults, `holiday.default`).
  v.object({ kind: v.literal('priceDrop'), watchId: v.id('priceWatches'), priceCents: v.number() }),
  v.object({ kind: v.literal('holiday'), skipId: v.id('routineSkips') }),
);
export type CandidateSource = Infer<typeof candidateSource>;

export const candidates = {
  familyId,
  recipientId: memberId,
  kind: notificationKind,
  dedupeKey: v.string(),
  /** `title` (G3 UX review, UX6, additive/optional): the item's own headline ("Return the library book"),
   * sanitized/length-capped draft+judge output — never the MEGA's name. Optional so a candidate written
   * before this field existed (or a hand-seeded row) just falls back to the MEGA's name at delivery time
   * (convex/model/proactive.ts `deliverCandidateLogic`). */
  draft: v.object({ text: v.string(), title: v.optional(v.string()), buttons: buttonSetId }),
  score: v.optional(v.number()),
  reason: v.optional(v.string()),
  delivery: v.optional(delivery),
  window: v.object({ from: v.number(), to: v.number() }),
  deliverAt: v.optional(v.number()),
  scheduledId: v.optional(v.id('_scheduled_functions')),
  status: v.union(v.literal('new'), v.literal('scheduled'), v.literal('delivered'), v.literal('dropped'), v.literal('cancelled')),
  /** Additive (G3): which trigger produced this candidate. Optional so it's fine on anything seeded
   * directly (seed.ts's hand-built "statement" row has no real trigger behind it). */
  source: v.optional(candidateSource),
};

export const notifications = {
  familyId,
  recipientId: memberId,
  candidateId: v.optional(v.id('candidates')),
  kind: notificationKind,
  loudness,
  title: v.string(),
  body: v.string(),
  megaId: v.id('megas'),
  buttons: v.array(button),
  messageId: v.optional(v.id('messages')),
  sentAt: v.optional(v.number()),
  heldUntil: v.optional(v.number()),
  answer: v.optional(v.object({ buttonId: v.string(), at: v.number(), via })),
  reply: v.optional(v.string()),
  /** Additive (G3): back-links to the row a button's real effect acts on (convex/model/
   * notificationEffects.ts) — at most one is ever set, matching `kind`. */
  reminderId: v.optional(v.id('reminders')),
  requestId: v.optional(v.id('requests')),
  /** Additive (CONTRACT §5 v0.11): failed `POST /push/answer` token-verification attempts against this
   * notification (convex/pushAnswer.ts) — a brute-force guard, same shape as `invites.failedAttempts`.
   * Never the HMAC secret or the token itself; nothing about the answer token is ever persisted. */
  answerFailedAttempts: v.optional(v.number()),
  /** GD (v0.13, additive): back-link for a chore reminder's "Done" button (`chore.default`). */
  choreId: v.optional(v.id('chores')),
};

export const requests = {
  familyId,
  fromMemberId: memberId,
  toMemberId: memberId,
  text: v.string(),
  status: v.union(v.literal('open'), v.literal('accepted'), v.literal('declined'), v.literal('done')),
  notificationId: v.optional(v.id('notifications')),
  /** Additive (G3): what accepting this request should actually do, declared by the `ask_member` tool call
   * that created it (PLAN.md -> Proactive engine step 6, "Yes -> tell Coral and add milk to Groceries") —
   * never inferred from the request's free-text `text` at answer time. Only `lists_add` for now; more tools
   * can join this union as the effect dispatcher (convex/model/requestEffects.ts) grows. */
  onAccept: v.optional(v.object({ tool: v.literal('lists_add'), listName: v.string(), text: v.string() })),
};

// ---------- GD (CONTRACT v0.13): layers and sharing, clashes, gift ideas ----------

/** The owner's own share (or unshare) of one of their private items — the ONLY way anything moves from a
 * private layer to the household layer (explicit-share rule, owner Oct 26). Written by `events.share` /
 * `events.unshare` / `shareSuggestions.answer` in the same mutation that changes the event's scope, never
 * by a model, a trigger or another member. Append-only audit trail. */
export const shareActions = {
  familyId,
  ownerId: memberId,
  /** GD backend (v0.13 addendum, additive, pending approval): `memory` items too, because
   * `shareSuggestions.answer` can share a private memory and every private→shared move needs this record. */
  item: v.union(v.object({ kind: v.literal('event'), eventId: v.id('events') }), v.object({ kind: v.literal('memory'), memoryId: v.id('memories') })),
  action: v.union(v.literal('share'), v.literal('unshare')),
  fromScope: scope,
  toScope: scope,
  at: v.number(),
  /** Set when the owner was answering a MEGA's suggestion. */
  suggestionId: v.optional(v.id('shareSuggestions')),
};

/** A MEGA asking the owner "Share it with the household?". Only ever shown to `ownerId`; answering it is
 * the owner's own act. The memory writer's old "matters to" crossing becomes one of these (item kind
 * 'memory') instead of an automatic trigger. A suggestion never changes anything by itself. */
export const shareSuggestions = {
  familyId,
  ownerId: memberId,
  item: v.union(v.object({ kind: v.literal('event'), eventId: v.id('events') }), v.object({ kind: v.literal('memory'), memoryId: v.id('memories') })),
  /** What the household would see if shared ("Dentist · Thu 4:00–5:00 PM"), written from the item itself. */
  preview: v.string(),
  /** Who would gain sight of it (snapshot at suggestion time). */
  audience: v.array(memberId),
  status: v.union(v.literal('pending'), v.literal('shared'), v.literal('kept'), v.literal('expired')),
  createdAt: v.number(),
  answeredAt: v.optional(v.number()),
  decidedBy, // what proposed the suggestion (rule:<id> | model:<id>)
  messageId: v.optional(v.id('messages')),
};

/** Two household-layer events that overlap and need the same person. Internal: no public function returns
 * this table; the app sees it only through its proposal. Never created from a private event. */
export const collisions = {
  familyId,
  eventIds: v.array(v.id('events')), // exactly 2, both on the household layer when detected
  memberId, // the person needed in both places
  dedupeKey: v.string(),
  /** v0.14a (additive): both events' timing and people when detected (model/clashes.ts `clashFingerprint`).
   * A dismissed or resolved clash is raised again only once this changes. */
  fingerprint: v.optional(v.string()),
  detectedAt: v.number(),
  status: v.union(v.literal('open'), v.literal('resolved'), v.literal('dismissed'), v.literal('stale')),
};

/** The before/after of the one event a fix changes. */
export const eventSnapshot = v.object({
  eventId: v.id('events'),
  title: v.string(),
  start: v.number(),
  end: v.optional(v.number()),
  who: v.array(memberId),
});

/** Hub's one proposed fix for a clash. Pending until the Admin approves; nothing changes before that. */
export const proposals = {
  familyId,
  collisionId: v.id('collisions'),
  /** The MEGA proposing it (the family MEGA, Hub), shown with the AI disclosure (config PROPOSAL_DISCLOSURE). */
  megaId: v.id('megas'),
  fix: v.union(
    v.object({ kind: v.literal('reassign'), eventId: v.id('events'), from: memberId, to: memberId }),
    v.object({ kind: v.literal('move'), eventId: v.id('events'), start: v.number(), end: v.optional(v.number()) }),
  ),
  /** Headline + one-line explanation, worded by Muse Wonder (config models.wording). */
  title: v.string(),
  text: v.string(),
  before: eventSnapshot,
  after: eventSnapshot,
  wordedBy: decidedBy, // model:<id>
  reasonedBy: decidedBy, // model:<id> (or rule:<id>) that picked the fix
  /** The family's members when the proposal was made. Approval is refused (VALIDATION, status 'stale')
   * if the membership changed since (OpenDuet learning: approvals are scoped to their audience). */
  audience: v.array(memberId),
  status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected'), v.literal('expired'), v.literal('stale')),
  createdAt: v.number(),
  expiresAt: v.number(),
  decision: v.optional(v.object({ byId: memberId, at: v.number(), approve: v.boolean(), audience: v.array(memberId) })),
  messageId: v.optional(v.id('messages')),
};

/** Gift ideas for an upcoming birthday. Built only from household-shared facts (config GIFTS.sourceScopes);
 * each idea cites the shared facts it's based on. Never visible to the person it's for, or to kids. */
export const giftIdeas = {
  familyId,
  forMemberId: memberId,
  occasion: v.literal('birthday'),
  date: dateOnly,
  basedOn: v.array(
    v.object({
      label: v.string(), // "Twin 1 shared: loves dinosaurs"
      source: v.union(v.object({ kind: v.literal('memory'), memoryId: v.id('memories') }), v.object({ kind: v.literal('member'), field: v.literal('activities') })),
    }),
  ),
  // v0.16 (G4b): `productRefs` — up to GIFTS.productsPerIdea catalog products for the idea (refs only; the app
  // reads current price and stock with `shopping.products`). `url` (G4's web-search link) stays the fallback.
  ideas: v.array(
    v.object({ title: v.string(), why: v.string(), price: v.optional(v.string()), basedOn: v.array(v.number()), url: v.optional(v.string()), productRefs: v.optional(v.array(productRef)) }),
  ),
  status: v.union(v.literal('queued'), v.literal('ready'), v.literal('failed')),
  createdBy: v.optional(memberId), // empty when Hub offered them on its own
  createdAt: v.number(),
  addedToList: v.array(v.number()), // idea indexes already added to the gift list
};

// ---------- GD: homework practice ----------

/** A worksheet photo an adult took (Convex file storage), and what Muse Spark read from it. */
export const homeworkSheets = {
  familyId,
  createdBy: memberId,
  storageId: v.id('_storage'),
  status: v.union(v.literal('reading'), v.literal('ready'), v.literal('failed')),
  topic: v.optional(v.string()), // "Fractions · Sheet 4"
  summary: v.optional(v.string()), // "Adding and taking away fractions, 6 problems."
  createdAt: v.number(),
};

/** One question. `answerIndex` never leaves the server (see `practiceView` in api.ts). */
export const practiceQuestion = v.object({
  id: v.string(),
  prompt: v.string(),
  choices: v.array(v.string()),
  answerIndex: v.number(),
  hint: v.string(),
});

export const practiceSets = {
  familyId,
  sheetId: v.id('homeworkSheets'),
  forMemberId: memberId,
  createdBy: memberId,
  status: v.union(v.literal('drafting'), v.literal('ready'), v.literal('done'), v.literal('failed')),
  questions: v.array(practiceQuestion),
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  /** Written when the kid finishes; the parent's summary card. */
  summary: v.optional(v.object({ correct: v.number(), total: v.number(), hintsUsed: v.number(), minutes: v.number(), note: v.string() })),
};

export const practiceAttempts = {
  familyId,
  setId: v.id('practiceSets'),
  questionId: v.string(),
  memberId,
  kind: v.union(v.literal('answer'), v.literal('hint')),
  choiceIndex: v.optional(v.number()),
  correct: v.optional(v.boolean()),
  at: v.number(),
};

// ---------- GD: chores and routines ----------

export const chores = {
  familyId,
  forMemberId: memberId,
  title: v.string(),
  bucks: v.number(),
  days: v.array(v.number()), // 0 = Sunday
  time: clockTime,
  createdBy: memberId,
  active: v.boolean(),
};

/** One day's instance of a chore: due → claimed (the kid tapped Done) → approved (an adult released bucks). */
export const choreClaims = {
  familyId,
  choreId: v.id('chores'),
  forMemberId: memberId,
  date: dateOnly,
  status: v.union(v.literal('due'), v.literal('claimed'), v.literal('approved'), v.literal('declined')),
  claimedAt: v.optional(v.number()),
  decidedById: v.optional(memberId),
  decidedAt: v.optional(v.number()),
};

export const routineStep = v.object({ id: v.string(), label: v.string(), detail: v.optional(v.string()) });

export const routines = {
  familyId,
  memberId,
  kind: routineKind,
  steps: v.array(routineStep),
  time: clockTime,
  days: v.array(v.number()),
  updatedBy: v.optional(memberId),
};

/** One day's checklist. Bedtime runs add items derived from tomorrow's HOUSEHOLD-layer events that include
 * the kid (`source.eventId`); private events never feed it. */
export const routineRuns = {
  familyId,
  routineId: v.id('routines'),
  memberId,
  kind: routineKind,
  date: dateOnly,
  steps: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      detail: v.optional(v.string()),
      done: v.boolean(),
      // GD backend addendum (pending approval): `title` is the household event's title when the item was made
      // ("Soccer practice"), so the card can say "Soccer tomorrow". Household events only, never private.
      source: v.optional(v.object({ eventId: v.id('events'), title: v.optional(v.string()), start: v.optional(v.number()) })),
    }),
  ),
  createdAt: v.number(),
  finishedAt: v.optional(v.number()),
};

// ---------- GD: Mega Bucks and the Store ----------

/** The Mega Bucks ledger. A kid's balance is the sum of their rows' `delta` (never stored separately).
 * Releases (+) are written only by an adult's `bucks.release`; spends (−) only by the kid's `store.buy`.
 * At most one release per practice set or chore claim (idempotent). */
export const bucksLedger = {
  familyId,
  memberId, // the kid
  delta: v.number(),
  source: v.union(
    v.object({ kind: v.literal('practice'), setId: v.id('practiceSets') }),
    v.object({ kind: v.literal('chore'), claimId: v.id('choreClaims') }),
    v.object({ kind: v.literal('bonus') }),
    v.object({ kind: v.literal('purchase'), purchaseId: v.id('purchases') }),
  ),
  byId: memberId, // the releasing adult, or the kid buying
  note: v.optional(v.string()),
  at: v.number(),
};

export const purchases = {
  familyId,
  memberId,
  itemId: storeItemId,
  price: v.number(),
  at: v.number(),
};

// ---------- places, art and system ----------

export const furnitureItem = v.object({
  kind: v.string(), // becomes a config-checked id when the room config lands (G5)
  x: v.number(),
  y: v.number(),
  color: v.optional(v.string()),
  posterImageId: v.optional(v.id('images')),
});

export const rooms = {
  familyId,
  ownerId: v.optional(memberId),
  size: v.object({ w: v.number(), h: v.number() }),
  wallColor: v.string(),
  furniture: v.array(furnitureItem),
};

export const images = {
  familyId,
  createdBy: memberId,
  purpose: v.union(v.literal('poster'), v.literal('wallpaper'), v.literal('sticker'), v.literal('scene')),
  prompt: v.string(),
  storageId: v.optional(v.id('_storage')),
  status: v.union(v.literal('queued'), v.literal('ready'), v.literal('failed')),
  cost: v.optional(v.number()),
};

export const integrations = {
  familyId,
  memberId: v.optional(memberId),
  kind: v.union(v.literal('ics'), v.literal('deviceCalendar'), v.literal('weather')),
  config: v.any(),
  lastSyncAt: v.optional(v.number()),
};

export const usage = {
  familyId,
  day: dateOnly,
  tokensIn: v.number(),
  tokensOut: v.number(),
  searches: v.number(),
  images: v.number(),
  cents: v.number(),
  /** Outstanding pre-call estimates not yet released (CONTRACT.md v0.9): `requireBudget` reserves an
   * estimate here atomically with its cap check, so a concurrent call can't pass the same check before the
   * first one's actual cost is recorded. `recordUsage`/`releaseReservation` release it. Optional/additive
   * so existing rows (and every caller that doesn't reserve) default to none reserved. */
  reservedCents: v.optional(v.number()),
};

export const clocks = { familyId, mode: v.union(v.literal('real'), v.literal('simulated')), offsetMs: v.number() };

// ---------- G4 (CONTRACT v0.15): places, weather, travel, search ----------

export const placeKind = literals(PLACE_KINDS);
export const alertSeverity = literals(ALERT_SEVERITIES);
export const searchOutcome = literals(SEARCH_OUTCOMES);
export const integrationFailure = literals(INTEGRATION_FAILURES);
export const geocodeStatus = literals(GEOCODE_STATUSES);

/** A family place (home, school, work, or custom). Household data: every member of the family may read it;
 * adults add, edit and remove (config PLACES.editors). Coordinates come from the Geocoder port (Mapbox,
 * `permanent` results so they may be stored) — never from the phone. `lat`/`lng` are empty until geocoded. */
export const places = {
  familyId,
  kind: placeKind,
  label: v.string(),
  address: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  geocode: v.object({ status: geocodeStatus, at: v.optional(v.number()) }),
  createdBy: memberId,
  updatedAt: v.number(),
  /** v0.16 (G4b, optional): an outdoor place (a field, a park). Events there get UV and air-quality tips. */
  outdoor: v.optional(v.boolean()),
};

/** Internal cache of provider responses per place (never returned raw; `weather.get` builds its view from it).
 * `data` is the Weather port's normalized result (`WeatherForecast` or `WeatherAlert[]`), not the vendor JSON. */
export const weatherCache = {
  familyId,
  placeId: v.id('places'),
  kind: v.union(v.literal('forecast'), v.literal('alerts')),
  fetchedAt: v.number(),
  expiresAt: v.number(),
  failure: v.optional(integrationFailure),
  data: v.any(),
};

/** One travel-time check for an event (leave-by). Visible only to members who can see the event itself. */
export const travelChecks = {
  familyId,
  eventId: v.id('events'),
  fromPlaceId: v.id('places'),
  toPlaceId: v.id('places'),
  /** The departure time asked about (ms). */
  departAt: v.number(),
  minutes: v.optional(v.number()),
  /** Mapbox `duration_typical` (traffic-free typical), for "longer than usual" wording. */
  typicalMinutes: v.optional(v.number()),
  distanceMeters: v.optional(v.number()),
  /** Event start − minutes − TRAVEL.leaveByBufferMinutes. */
  leaveBy: v.optional(v.number()),
  failure: v.optional(integrationFailure),
  checkedAt: v.number(),
};

/** Every web search a member's MEGA ran, and what the kid filter did. The member reads their own; a kid's
 * parents read a kid's `blocked`/`rephrased` rows only when that kid's `kidControls.tellsParents.
 * blockedSearches` is on. Siblings never. `decidedBy` (OpenDuet learning) names the rule or model that
 * blocked or rephrased it. */
export const searchLog = {
  familyId,
  memberId,
  at: v.number(),
  query: v.string(),
  outcome: searchOutcome,
  rephrasedTo: v.optional(v.string()),
  /** The blocked category (KID_SAFETY.blockedCategories), when blocked. */
  category: v.optional(v.string()),
  decidedBy: v.optional(decidedBy),
  sourceCount: v.number(),
  messageId: v.optional(v.id('messages')),
};

// ---------- G4b (CONTRACT v0.16): shopping, holidays ----------

export const priceWatchStatus = literals(PRICE_WATCH_STATUSES);
export const routineSkipStatus = literals(ROUTINE_SKIP_STATUSES);

/** A gift-list product whose price MEGA watches (made when an adult adds a gift idea with products to the list).
 * Same audience as the gift ideas (GIFTS.viewers, never `forMemberId`). This is the family's own saved item, not
 * a cached search result: it keeps the ref, the title/store/url the adult saw when saving it, and the prices our
 * checks observed (`baselinePriceCents` when saved). `alertedPriceCents` is the last price a drop was announced
 * at (dedupe: one alert per watch × price). Stops after the occasion (SHOPPING.stopAfterOccasionDays). */
export const priceWatches = {
  familyId,
  giftIdeasId: v.id('giftIdeas'),
  ideaIndex: v.number(),
  forMemberId: memberId, // the gift's recipient: never told, never shown
  ref: productRef,
  title: v.string(),
  store: v.string(),
  url: v.string(),
  currency: v.string(),
  baselinePriceCents: v.number(),
  lastPriceCents: v.optional(v.number()),
  lastCheckedAt: v.optional(v.number()),
  lastFailure: v.optional(integrationFailure),
  alertedPriceCents: v.optional(v.number()),
  status: priceWatchStatus,
  createdBy: memberId,
  createdAt: v.number(),
  stoppedBy: v.optional(memberId),
  stoppedAt: v.optional(v.number()),
};

/** "Monday is Veterans Day. Pause the morning routine and chores?" A federal holiday isn't always a day off
 * school, so MEGA asks the adults the evening before (HOLIDAYS.askAt) instead of deciding. `paused` makes that
 * day's morning routine, chores and the night-before bedtime prep skip for `memberIds` (the kids who had any);
 * `kept` changes nothing. `answeredBy` is the adult who decided. One row per family × date. */
export const routineSkips = {
  familyId,
  date: dateOnly,
  holidayName: v.string(),
  memberIds: v.array(memberId),
  status: routineSkipStatus,
  askedAt: v.number(),
  answeredBy: v.optional(memberId),
  answeredAt: v.optional(v.number()),
};

/** A family's cached public holidays for one country × year (Nager.Date; public data, safe to cache). Refreshed
 * weekly (HOLIDAYS.refreshDays) and on demand; `failure` when the provider couldn't answer. Internal: the app
 * reads `holidays.upcoming`. */
export const holidays = {
  familyId,
  country: v.string(),
  year: v.number(),
  list: v.array(holiday),
  fetchedAt: v.number(),
  expiresAt: v.number(),
  failure: v.optional(integrationFailure),
};

/** Every table's fields, keyed by table name. convex/schema.ts iterates this, so a table can't be missed. */
export const TABLES = {
  families,
  members,
  relationships,
  megas,
  invites,
  grants,
  sharing,
  kidControls,
  settings,
  threads,
  messages,
  memories,
  profiles,
  events,
  reminders,
  lists,
  listItems,
  familyEvents,
  candidates,
  notifications,
  requests,
  rooms,
  images,
  integrations,
  usage,
  clocks,
  shareActions,
  shareSuggestions,
  collisions,
  proposals,
  giftIdeas,
  homeworkSheets,
  practiceSets,
  practiceAttempts,
  chores,
  choreClaims,
  routines,
  routineRuns,
  bucksLedger,
  purchases,
  places,
  weatherCache,
  travelChecks,
  searchLog,
  priceWatches,
  routineSkips,
  holidays,
} as const;
export type TableName = keyof typeof TABLES;
