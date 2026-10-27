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
import { author, messageBody, saveChip } from './messages';
import { BUTTON_SET_IDS, STICKERS, WALLPAPER_PRESET_IDS } from '../config/ids';
import { literals } from './validators';

// Config-backed values: stored as strings, but only ids that exist in shared/config are accepted.
export const stickerId = literals(STICKERS);
export const wallpaperPresetId = literals(WALLPAPER_PRESET_IDS);
export const buttonSetId = literals(BUTTON_SET_IDS);

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

export const megaLook = v.object({ hex: v.string(), sticker: stickerId });
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

export const invites = {
  familyId,
  memberId,
  tokenHash: v.string(),
  expiresAt: v.number(),
  redeemedAt: v.optional(v.number()),
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

export const threads = { familyId, ownerId: memberId, megaIds: v.array(v.id('megas')), lastAt: v.number() };

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
};

export const reactionCounts = v.object({ sent: v.number(), answered: v.number(), ignored: v.number(), up: v.number(), down: v.number() });

export const profiles = {
  familyId,
  memberId,
  callMe: v.string(),
  basics: v.record(v.string(), v.string()),
  routines: v.array(v.object({ text: v.string(), days: v.array(v.number()), time: v.optional(clockTime), confirmed: v.boolean() })),
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
} as const;
export type TableName = keyof typeof TABLES;
