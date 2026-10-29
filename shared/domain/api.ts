// CONTRACT §4. Every public function: its type, args and returns. Backend functions spread these
// (`query({ ...API.today.get, handler })`), so a function can't drift from the contract, and tests
// iterate this map to check every function exists and to generate the privacy grid.
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { type Infer, v } from 'convex/values';
import { IDENTITY } from '../config/identity';
import { notificationKind, personality, platform, reaction, scope, shareLevel, station, themeName, via } from './enums';
import { holiday, product, productRef } from './integrationShapes';
import { blockAnswer, spokenMention } from './messages';
import * as T from './tables';
import { literals, withSystemFields } from './validators';

// ---------- documents as returned to the app ----------

export const memberDoc = withSystemFields('members', T.members);
export const megaDoc = withSystemFields('megas', T.megas);
export const settingsDoc = withSystemFields('settings', T.settings);
export const messageDoc = withSystemFields('messages', T.messages);
export const memoryDoc = withSystemFields('memories', T.memories);
export const eventDoc = withSystemFields('events', T.events);
export const listDoc = withSystemFields('lists', T.lists);
export const listItemDoc = withSystemFields('listItems', T.listItems);
export const notificationDoc = withSystemFields('notifications', T.notifications);
export const requestDoc = withSystemFields('requests', T.requests);
export const roomDoc = withSystemFields('rooms', T.rooms);
export const kidControlsDoc = withSystemFields('kidControls', T.kidControls);
// GD (CONTRACT v0.13)
export const shareSuggestionDoc = withSystemFields('shareSuggestions', T.shareSuggestions);
export const proposalDoc = withSystemFields('proposals', T.proposals);
export const giftIdeasDoc = withSystemFields('giftIdeas', T.giftIdeas);
export const homeworkSheetDoc = withSystemFields('homeworkSheets', T.homeworkSheets);
export const choreDoc = withSystemFields('chores', T.chores);
export const choreClaimDoc = withSystemFields('choreClaims', T.choreClaims);
export const routineDoc = withSystemFields('routines', T.routines);
export const routineRunDoc = withSystemFields('routineRuns', T.routineRuns);
export const bucksLedgerDoc = withSystemFields('bucksLedger', T.bucksLedger);
// G4 (CONTRACT v0.15)
export const placeDoc = withSystemFields('places', T.places);
export const searchLogDoc = withSystemFields('searchLog', T.searchLog);
// G4b (CONTRACT v0.16)
export const priceWatchDoc = withSystemFields('priceWatches', T.priceWatches);
export const routineSkipDoc = withSystemFields('routineSkips', T.routineSkips);

// ---------- view models ----------

export const viewer = v.object({
  member: memberDoc,
  family: v.object({ _id: v.id('families'), name: v.string(), timezone: v.string() }),
  mega: v.union(megaDoc, v.null()),
  settings: settingsDoc,
  theme: v.object({ name: themeName, accent: v.string() }),
  isParentOf: v.array(v.id('members')),
});
export type Viewer = Infer<typeof viewer>;

export const megaStatus = v.object({ station, label: v.string(), busy: v.boolean() });

export const statement = v.object({ text: v.string(), candidateId: v.id('candidates'), megaId: v.id('megas') });

export const listSummary = v.object({ list: listDoc, open: v.number(), items: v.array(listItemDoc) });

export const widgetEntry = v.object({
  at: v.number(),
  kind: v.union(v.literal('event'), v.literal('statement'), v.literal('empty')),
  title: v.string(),
  subtitle: v.optional(v.string()),
  who: v.optional(v.array(v.object({ name: v.string(), hex: v.string() }))),
  mega: v.object({ name: v.string(), hex: v.string(), sticker: v.string(), face: v.string() }),
  link: v.string(),
});
export type WidgetEntry = Infer<typeof widgetEntry>;

export const memberCard = v.object({
  member: memberDoc,
  mega: v.union(megaDoc, v.null()),
  status: v.union(megaStatus, v.null()),
});

export const memberDetail = v.object({
  member: memberDoc,
  mega: v.union(megaDoc, v.null()),
  relationshipToViewer: v.union(T.relationships.kind, v.null()),
  kidControls: v.union(kidControlsDoc, v.null()), // only for the kid's parents
  canReadChat: v.boolean(),
});

export const activityItem = v.object({ at: v.number(), type: v.string(), summary: v.string() });

const eventFields = {
  title: v.string(),
  start: v.number(),
  end: v.optional(v.number()),
  allDay: v.optional(v.string()),
  who: v.array(v.id('members')),
  place: v.optional(v.string()),
  scope,
  /** v0.15 (additive): a saved family place (`places`), for travel time and weather. */
  placeId: v.optional(v.id('places')),
};

const megaPatchFields = {
  name: v.optional(v.string()),
  look: v.optional(T.megaLook),
  personality: v.optional(personality),
};

const kidControlsPatch = v.object({
  homeworkMode: v.optional(v.boolean()),
  quietHours: v.optional(T.kidControlsFields.quietHours),
  dailyMinutes: v.optional(v.number()),
  blockedTopics: v.optional(v.array(v.string())),
  tellsParents: v.optional(T.kidControlsFields.tellsParents),
  parentsCanReadChat: v.optional(v.boolean()),
  webSearch: v.optional(v.boolean()),
});

// ---------- GD (CONTRACT v0.13) view models ----------

const megaBadge = v.object({ megaId: v.id('megas'), name: v.string(), hex: v.string(), sticker: v.string() });

/** A clash proposal as the app shows it: the fix, before/after, and the AI disclosure line. */
export const proposalView = v.object({
  proposal: proposalDoc,
  mega: megaBadge,
  disclosure: v.string(),
  /** GD backend addendum (pending approval): both clashing events (household layer only), so the calendar
   * can tag both, not just the one the fix changes. */
  clashEventIds: v.array(v.id('events')),
});

/** A question as the app gets it. The correct choice is never included, for anyone; the server checks
 * answers. `hint` is filled only once the kid has asked for it (or answered wrong). */
export const practiceQuestionView = v.object({
  id: v.string(),
  prompt: v.string(),
  choices: v.array(v.string()),
  hint: v.optional(v.string()),
  answered: v.union(v.object({ correct: v.boolean(), tries: v.number() }), v.null()),
});
export const practiceView = v.object({
  setId: v.id('practiceSets'),
  forMemberId: v.id('members'),
  status: T.practiceSets.status,
  topic: v.optional(v.string()),
  questions: v.array(practiceQuestionView),
  summary: v.optional(T.practiceSets.summary),
  /** The release for this set, once an adult made it. */
  released: v.union(v.object({ amount: v.number(), byId: v.id('members'), at: v.number() }), v.null()),
  /** True for an adult who may release Mega Bucks for it (config MEGA_BUCKS.releasers). */
  canRelease: v.boolean(),
});

export const choreView = v.object({ chore: choreDoc, today: v.union(choreClaimDoc, v.null()) });

export const storeItemView = v.object({
  id: T.storeItemId,
  label: v.string(),
  price: v.number(),
  hex: v.optional(v.string()),
  owned: v.boolean(),
  /** Currently on the kid's MEGA (look parts) — furniture placement is read from the room. */
  wearing: v.boolean(),
});

const bucksSource = v.union(
  v.object({ kind: v.literal('practice'), setId: v.id('practiceSets') }),
  v.object({ kind: v.literal('chore'), claimId: v.id('choreClaims') }),
  v.object({ kind: v.literal('bonus'), memberId: v.id('members') }),
);

/** Screen 9 redesign (v0.14): the invite card. `family` is who has already joined (name + MEGA badge). */
export const invitePreview = v.union(
  v.object({ status: v.literal('invalid') }),
  v.object({ status: v.literal('expired'), inviterName: v.string() }),
  v.object({ status: v.literal('locked'), inviterName: v.string() }),
  v.object({
    status: v.literal('ok'),
    kind: v.union(v.literal('adult'), v.literal('kid')),
    inviterName: v.string(),
    memberName: v.string(),
    mega: T.inviteMega,
    family: v.array(v.object({ name: v.string(), hex: v.string(), sticker: T.stickerId })),
  }),
);
export type InvitePreview = Infer<typeof invitePreview>;

// ---------- G4 (CONTRACT v0.15) view models ----------

/** The weather for one place, built from `weatherCache` (never the vendor JSON). `stale` when the cache is past
 * its TTL (a refresh is queued); `failure` when there's no usable data at all. */
export const weatherView = v.object({
  placeId: v.id('places'),
  placeLabel: v.string(),
  fetchedAt: v.union(v.number(), v.null()),
  stale: v.boolean(),
  failure: v.optional(T.integrationFailure),
  now: v.union(v.object({ tempF: v.number(), code: v.number(), summary: v.string() }), v.null()),
  hours: v.array(v.object({ at: v.number(), tempF: v.number(), precipPct: v.number(), code: v.number() })),
  today: v.union(v.object({ highF: v.number(), lowF: v.number(), precipPct: v.number(), code: v.number() }), v.null()),
  alerts: v.array(v.object({ id: v.string(), event: v.string(), headline: v.string(), severity: T.alertSeverity, ends: v.optional(v.number()) })),
  /** v0.16 (G4b, optional): US AQI and UV now, and today's peak UV (Open-Meteo air quality). Absent when the
   * air-quality call failed or hasn't run; a missing number is omitted, never guessed. */
  air: v.optional(v.object({ usAqi: v.optional(v.number()), uvIndex: v.optional(v.number()), uvIndexMax: v.optional(v.number()) })),
});
export type WeatherView = Infer<typeof weatherView>;

/** Leave-by for one event, from its latest `travelChecks` row. `failure` instead of numbers when it can't be
 * checked: `not_configured` (no MAPBOX_TOKEN), `no_result` (no route), or `noPlace` when the event or the
 * origin has no geocoded place. */
export const travelView = v.object({
  eventId: v.id('events'),
  from: v.union(v.object({ placeId: v.id('places'), label: v.string() }), v.null()),
  to: v.union(v.object({ placeId: v.id('places'), label: v.string() }), v.null()),
  minutes: v.union(v.number(), v.null()),
  typicalMinutes: v.union(v.number(), v.null()),
  leaveBy: v.union(v.number(), v.null()),
  checkedAt: v.union(v.number(), v.null()),
  failure: v.optional(v.union(T.integrationFailure, v.literal('noPlace'))),
});
export type TravelView = Infer<typeof travelView>;

// ---------- G4b (CONTRACT v0.16) view models ----------

/** `shopping.products`: current details for refs, read live (nothing stored). `failure` when the catalog couldn't
 * answer; refs it no longer knows are left out. */
export const productsResult = v.object({ products: v.array(product), failure: v.optional(T.integrationFailure) });
export type ProductsResult = Infer<typeof productsResult>;
export type PriceWatch = Infer<typeof priceWatchDoc>;
export type RoutineSkip = Infer<typeof routineSkipDoc>;

/** One upcoming public holiday for the calendar's marker. `skip` is the family's decision for that day, when an
 * adult has made one (kids see `paused` too: their routine says so). */
export const upcomingHoliday = v.object({
  ...holiday.fields,
  skip: v.union(v.object({ skipId: v.id('routineSkips'), status: T.routineSkipStatus }), v.null()),
});
export type UpcomingHoliday = Infer<typeof upcomingHoliday>;

// ---------- the API ----------

type Kind = 'query' | 'mutation' | 'action';
/** day1: 'real' works on seeded data from G1; 'stub' returns correctly shaped canned data until filled in. */
type Fn = { kind: Kind; day1: 'real' | 'stub'; args: Record<string, any>; returns: any; adminOnly?: boolean };
const fn = <F extends Fn>(f: F) => f;

export const API = {
  me: {
    get: fn({ kind: 'query', day1: 'real', args: {}, returns: v.union(viewer, v.null()) }),
  },
  onboarding: {
    start: fn({
      kind: 'mutation',
      day1: 'real',
      args: { familyName: v.string(), timezone: v.string(), myName: v.string(), look: T.megaLook, personality, megaName: v.string() },
      returns: v.object({ familyId: v.id('families'), threadId: v.id('threads') }),
    }),
  },
  invites: {
    // v0.14 (additive): `mega` — the MEGA the admin sets for the person (omitted: their existing MEGA, or a
    // default preset). It comes with the invite; adults may change it on join, kids can't.
    create: fn({ kind: 'mutation', day1: 'real', args: { memberId: v.id('members'), mega: v.optional(T.inviteMega) }, returns: v.object({ url: v.string(), qrPayload: v.string(), expiresAt: v.number() }) }),
    // v0.14 (additive): what the join screen shows before anyone is a member. Callable signed out (the token
    // is the credential); returns names and MEGA looks only — never ids, the parent code or the token hash.
    preview: fn({ kind: 'query', day1: 'real', args: { token: v.string() }, returns: invitePreview }),
    // CONTRACT.md v0.5: changed from a mutation to an action (not additive — see the changelog). The
    // wrong-parent-code attempt counter must persist even when the call itself still reports
    // WRONG_PARENT_CODE; Convex mutations are strictly atomic (a mutation that writes and then throws
    // rolls the write back too), so only an action's independently-committed `ctx.runMutation` calls can
    // do both in one round trip.
    // v0.14 (additive): `mega` — an adult's change to the MEGA the invite came with (FORBIDDEN for a kid).
    redeem: fn({ kind: 'action', day1: 'real', args: { token: v.string(), parentCode: v.optional(v.string()), mega: v.optional(T.inviteMega) }, returns: v.object({ memberId: v.id('members') }) }),
  },
  family: {
    parentCode: fn({ kind: 'query', day1: 'real', adminOnly: true, args: {}, returns: v.object({ code: v.string() }) }),
    members: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(memberCard) }),
    member: fn({ kind: 'query', day1: 'real', args: { memberId: v.id('members') }, returns: memberDetail }),
    kidThread: fn({ kind: 'query', day1: 'real', args: { memberId: v.id('members'), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(messageDoc) }),
    comingUp: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(eventDoc) }),
  },
  chat: {
    thread: fn({ kind: 'query', day1: 'real', args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(messageDoc) }),
    send: fn({
      kind: 'mutation',
      day1: 'real', // G2: runs the real agent loop (convex/agent/loop.ts), not a canned reply

      args: { text: v.string(), mentions: v.optional(v.array(v.id('megas'))), via: v.union(v.literal('text'), v.literal('voice')), attachments: v.optional(v.array(v.id('_storage'))) },
      returns: v.object({ messageId: v.id('messages'), replyMessageId: v.id('messages'), streamId: v.string() }),
    }),
    streamBody: fn({
      kind: 'query',
      day1: 'real',
      args: { streamId: v.string() },
      returns: v.object({ text: v.string(), status: v.union(v.literal('pending'), v.literal('streaming'), v.literal('done'), v.literal('error'), v.literal('timeout')) }),
    }),
    // CONTRACT.md v0.8 (additive, pending approval): `streamId` — when answering the block feeds the
    // answer back into the agent loop and the MEGA replies (same MEGA that asked), this is that reply's
    // persistent-text-streaming stream id, so talk mode can caption it exactly like a normal `chat.send`
    // reply. `undefined` when there was no MEGA to reply as.
    answerBlock: fn({
      kind: 'mutation',
      day1: 'real',
      args: { messageId: v.id('messages'), answer: blockAnswer, via },
      returns: v.object({ answerMessageId: v.id('messages'), streamId: v.optional(v.string()) }),
    }),
    react: fn({ kind: 'mutation', day1: 'real', args: { messageId: v.id('messages'), reaction: v.union(reaction, v.null()) }, returns: v.null() }),
    // CONTRACT v0.13b (additive, owner Oct 28: never an empty chat). The app calls this when the caller's own
    // thread is empty; their MEGA starts the conversation (a kid: the KidsIntro messages; an adult: a
    // get-to-know-you greeting + choices). Idempotent: `started: false` when the thread already has messages.
    start: fn({ kind: 'mutation', day1: 'real', args: {}, returns: v.object({ started: v.boolean() }) }),
  },
  files: {
    uploadUrl: fn({ kind: 'mutation', day1: 'real', args: {}, returns: v.string() }),
  },
  talk: {
    transcribe: fn({ kind: 'action', day1: 'real', args: { storageId: v.id('_storage') }, returns: v.object({ text: v.string(), mentions: v.array(spokenMention) }) }), // G2: real Transcriber + ChatModel
  },
  today: {
    get: fn({
      kind: 'query',
      day1: 'real',
      args: {},
      returns: v.object({
        events: v.array(eventDoc),
        waitingOnYou: v.array(v.union(v.object({ kind: v.literal('request'), request: requestDoc }), v.object({ kind: v.literal('notification'), notification: notificationDoc }))),
        lists: v.array(listSummary),
        statement: v.union(statement, v.null()),
      }),
    }),
  },
  megas: {
    status: fn({ kind: 'query', day1: 'real', args: { megaId: v.id('megas') }, returns: megaStatus }),
    mine: fn({ kind: 'query', day1: 'real', args: {}, returns: megaDoc }),
    // GD backend addendum (pending approval). Any member: the family MEGA's badge (Hub's name, color,
    // sticker) for share-suggestion and calendar notes.
    family: fn({ kind: 'query', day1: 'real', args: {}, returns: megaBadge }),
    update: fn({ kind: 'mutation', day1: 'real', args: megaPatchFields, returns: v.null() }),
    activity: fn({ kind: 'query', day1: 'real', adminOnly: true, args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(activityItem) }),
  },
  widgets: {
    timeline: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(widgetEntry) }),
  },
  sharing: {
    get: fn({ kind: 'query', day1: 'real', args: {}, returns: v.union(v.object({ schedule: shareLevel, lists: shareLevel, hqActivity: shareLevel }), v.null()) }),
    set: fn({ kind: 'mutation', day1: 'real', args: { schedule: v.optional(shareLevel), lists: v.optional(shareLevel), hqActivity: v.optional(shareLevel) }, returns: v.null() }),
  },
  memories: {
    list: fn({ kind: 'query', day1: 'real', args: { scope: v.optional(scope), search: v.optional(v.string()), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(memoryDoc) }),
    forget: fn({ kind: 'mutation', day1: 'real', args: { memoryId: v.id('memories') }, returns: v.null() }),
    changeScope: fn({ kind: 'mutation', day1: 'real', args: { memoryId: v.id('memories'), scope, granteeIds: v.optional(v.array(v.id('members'))) }, returns: v.null() }),
  },
  kidControls: {
    set: fn({ kind: 'mutation', day1: 'real', args: { memberId: v.id('members'), patch: kidControlsPatch }, returns: v.null() }),
  },
  calendar: {
    range: fn({ kind: 'query', day1: 'real', args: { from: v.number(), to: v.number() }, returns: v.array(eventDoc) }),
  },
  events: {
    create: fn({ kind: 'mutation', day1: 'real', args: eventFields, returns: v.id('events') }),
    update: fn({
      kind: 'mutation',
      day1: 'real',
      // v0.15 (additive): `placeId` — set or change the event's saved place (null clears it).
      args: {
        eventId: v.id('events'),
        patch: v.object({
          title: v.optional(v.string()),
          start: v.optional(v.number()),
          end: v.optional(v.number()),
          who: v.optional(v.array(v.id('members'))),
          place: v.optional(v.string()),
          placeId: v.optional(v.union(v.id('places'), v.null())),
        }),
      },
      returns: v.null(),
    }),
    cancel: fn({ kind: 'mutation', day1: 'real', args: { eventId: v.id('events') }, returns: v.null() }),
    // GD (v0.13). Owner only: the caller must be the event's owner (`ownerId`, else `createdBy`), and the
    // event must be on their private layer. Moves it to the household layer (scope 'family') and writes a
    // `shareActions` row in the same mutation. Anyone else → FORBIDDEN; a household event → VALIDATION.
    share: fn({ kind: 'mutation', day1: 'real', args: { eventId: v.id('events') }, returns: v.null() }),
    // GD (v0.13). Owner only: moves an event the caller shared back to their private layer (+ shareActions row).
    unshare: fn({ kind: 'mutation', day1: 'real', args: { eventId: v.id('events') }, returns: v.null() }),
  },
  lists: {
    all: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(listSummary) }),
    addItem: fn({ kind: 'mutation', day1: 'real', args: { listId: v.id('lists'), text: v.string() }, returns: v.id('listItems') }),
    check: fn({ kind: 'mutation', day1: 'real', args: { itemId: v.id('listItems'), checked: v.boolean() }, returns: v.null() }),
    remove: fn({ kind: 'mutation', day1: 'real', args: { itemId: v.id('listItems') }, returns: v.null() }),
  },
  requests: {
    // G3: real effects (PLAN.md -> Proactive engine step 6) — see convex/model/requestEffects.ts.
    respond: fn({ kind: 'mutation', day1: 'real', args: { requestId: v.id('requests'), accept: v.boolean() }, returns: v.null() }),
  },
  hq: {
    room: fn({
      kind: 'query',
      day1: 'real',
      args: { ownerId: v.optional(v.id('members')) },
      returns: v.object({ room: roomDoc, megas: v.array(v.object({ megaId: v.id('megas'), station, label: v.string(), busy: v.boolean() })), narration: v.string() }),
    }),
  },
  rooms: {
    update: fn({ kind: 'mutation', day1: 'real', args: { furniture: v.array(T.furnitureItem), wallColor: v.optional(v.string()) }, returns: v.null() }),
  },
  images: {
    create: fn({ kind: 'mutation', day1: 'stub', args: { purpose: v.union(v.literal('poster'), v.literal('wallpaper')), prompt: v.string() }, returns: v.object({ imageId: v.id('images') }) }),
    get: fn({ kind: 'query', day1: 'real', args: { imageId: v.id('images') }, returns: v.object({ status: T.images.status, url: v.union(v.string(), v.null()) }) }),
  },
  settings: {
    set: fn({
      kind: 'mutation',
      day1: 'real',
      args: { theme: v.optional(themeName), accent: v.optional(T.accent), wallpaper: v.optional(T.wallpaper), notify: v.optional(T.notifyPrefs) },
      returns: v.null(),
    }),
  },
  push: {
    register: fn({ kind: 'mutation', day1: 'real', args: { token: v.string(), platform }, returns: v.null() }),
  },
  notifications: {
    // G3: real effects (PLAN.md -> Proactive engine step 6), idempotent — see convex/model/
    // notificationEffects.ts and convex/model/requestEffects.ts.
    answer: fn({
      kind: 'mutation',
      day1: 'real',
      args: { notificationId: v.id('notifications'), buttonId: v.string(), via: v.union(v.literal('push'), v.literal('block'), v.literal('widget')) },
      returns: v.object({ reply: v.string() }),
    }),
    // CONTRACT.md v0.6 (pending approval), additive: the chat thread's `{ kind: 'notification',
    // notificationId }` card (CONTRACT §3) had no way to load its content and rendered only the word
    // "Notification" (G1 fix). Only the notification's recipient may read it, same as `notifications.answer`.
    get: fn({ kind: 'query', day1: 'real', args: { notificationId: v.id('notifications') }, returns: notificationDoc }),
  },
  clock: {
    get: fn({ kind: 'query', day1: 'real', args: {}, returns: v.object({ now: v.number(), mode: T.clocks.mode }) }),
    jump: fn({ kind: 'mutation', day1: 'real', adminOnly: true, args: { to: v.number() }, returns: v.null() }),
  },
  demo: {
    // Replaces the old ad hoc `/demo-signin` HTTP route (Milestone G1 contract change, v0.4 pending
    // approval — see CONTRACT.md's changelog). Requires an authenticated identity (an anonymous Better
    // Auth session is fine), FORBIDDEN unless DEMO_MODE==='true', and relinks the chosen sample member.
    signInAs: fn({ kind: 'mutation', day1: 'real', args: { as: literals(['admin', 'partner', 'twin1', 'twin2']) }, returns: v.null() }),
  },

  // ---------- GD (CONTRACT v0.13): demo features (real since the GD backend). ----------

  shareSuggestions: {
    // The caller's own pending suggestions (ownerId === viewer). Nobody else ever sees them.
    mine: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(shareSuggestionDoc) }),
    get: fn({ kind: 'query', day1: 'real', args: { suggestionId: v.id('shareSuggestions') }, returns: shareSuggestionDoc }),
    // Owner only. share: true runs the same path as `events.share` (records `suggestionId`); false keeps it
    // private. Idempotent: answering twice returns null and changes nothing.
    answer: fn({ kind: 'mutation', day1: 'real', args: { suggestionId: v.id('shareSuggestions'), share: v.boolean() }, returns: v.null() }),
  },
  proposals: {
    // Adults (admin + adult). Pending proposals, newest first. Kids → FORBIDDEN.
    open: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(proposalView) }),
    // Adults. Any status (so the card can show "Approved by Admin…").
    get: fn({ kind: 'query', day1: 'real', args: { proposalId: v.id('proposals') }, returns: proposalView }),
    // Admin only (config CLASH.approverRole). approve: true applies the fix through the same path as
    // `events.update` and then notifies the people it moved; false changes nothing. Refused with VALIDATION
    // if the proposal isn't pending, has expired, or the family's membership changed since it was made.
    decide: fn({ kind: 'mutation', day1: 'real', adminOnly: true, args: { proposalId: v.id('proposals'), approve: v.boolean() }, returns: v.null() }),
  },
  gifts: {
    // Adults only, and never the member the ideas are for. Ready sets for birthdays within GIFTS.lookaheadDays.
    upcoming: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(giftIdeasDoc) }),
    get: fn({ kind: 'query', day1: 'real', args: { giftIdeasId: v.id('giftIdeas') }, returns: giftIdeasDoc }),
    // Adults, not for themselves. Queues a set (Muse Spark + kid-safe web search in G4) built only from
    // household-shared facts; returns at once with status 'queued'.
    generate: fn({ kind: 'mutation', day1: 'real', args: { forMemberId: v.id('members') }, returns: v.object({ giftIdeasId: v.id('giftIdeas') }) }),
    // Adults. Adds one idea to the adults-scope "Gift ideas" list (created on first use).
    addToList: fn({ kind: 'mutation', day1: 'real', args: { giftIdeasId: v.id('giftIdeas'), index: v.number() }, returns: v.id('listItems') }),
  },
  homework: {
    // Adults. `storageId` from `files.uploadUrl`. Muse Spark (models.vision) reads the photo in the background;
    // the sheet's card appears in the caller's thread when it's ready.
    submit: fn({ kind: 'mutation', day1: 'real', args: { storageId: v.id('_storage') }, returns: v.object({ sheetId: v.id('homeworkSheets') }) }),
    // Adults in the family.
    sheet: fn({ kind: 'query', day1: 'real', args: { sheetId: v.id('homeworkSheets') }, returns: homeworkSheetDoc }),
    // A parent of `forMemberId` (a kid). count within HOMEWORK.questions. Drafts the set in the background
    // and sends the kid a practice card when it's ready.
    makePractice: fn({
      kind: 'mutation',
      day1: 'real',
      args: { sheetId: v.id('homeworkSheets'), forMemberId: v.id('members'), count: v.number() },
      returns: v.object({ setId: v.id('practiceSets') }),
    }),
  },
  practice: {
    // The kid it's for, or that kid's parents. Never includes the correct answers.
    get: fn({ kind: 'query', day1: 'real', args: { setId: v.id('practiceSets') }, returns: practiceView }),
    // The kid it's for only. A wrong answer returns the hint (a guiding question, never the answer).
    answer: fn({
      kind: 'mutation',
      day1: 'real',
      args: { setId: v.id('practiceSets'), questionId: v.string(), choiceIndex: v.number() },
      returns: v.object({ correct: v.boolean(), hint: v.optional(v.string()), done: v.boolean() }),
    }),
    // The kid it's for only. Records that a hint was used.
    hint: fn({ kind: 'mutation', day1: 'real', args: { setId: v.id('practiceSets'), questionId: v.string() }, returns: v.object({ hint: v.string() }) }),
  },
  chores: {
    // A kid: their own chores (memberId omitted or their own id). An adult: any kid's, by memberId. Others → FORBIDDEN.
    list: fn({ kind: 'query', day1: 'real', args: { memberId: v.optional(v.id('members')) }, returns: v.array(choreView) }),
    claim: fn({ kind: 'query', day1: 'real', args: { claimId: v.id('choreClaims') }, returns: choreView }),
    // Adults (CHORES.managers), for a kid in the family.
    create: fn({
      kind: 'mutation',
      day1: 'real',
      args: { forMemberId: v.id('members'), title: v.string(), bucks: v.optional(v.number()), days: v.array(v.number()), time: v.string() },
      returns: v.id('chores'),
    }),
    update: fn({
      kind: 'mutation',
      day1: 'real',
      args: {
        choreId: v.id('chores'),
        patch: v.object({ title: v.optional(v.string()), bucks: v.optional(v.number()), days: v.optional(v.array(v.number())), time: v.optional(v.string()), active: v.optional(v.boolean()) }),
      },
      returns: v.null(),
    }),
    // The kid it's for only. Claims today's instance ("Done"); the adults get an approve card. Idempotent.
    markDone: fn({ kind: 'mutation', day1: 'real', args: { choreId: v.id('chores') }, returns: v.id('choreClaims') }),
    // v0.14a: the kid it's for only, on today's still-due instance. The card's "In 10 min": reminds again
    // after CHORES.snoozeMinutes through the normal timing (quiet hours, caps) — the same path as the push's
    // snooze_10 button. VALIDATION when there's nothing due to snooze.
    snooze: fn({ kind: 'mutation', day1: 'real', args: { choreId: v.id('chores') }, returns: v.object({ remindAt: v.number() }) }),
    // Adults. Declines a claim ("not done yet"); approving is `bucks.release` with source chore.
    decline: fn({ kind: 'mutation', day1: 'real', args: { claimId: v.id('choreClaims') }, returns: v.null() }),
  },
  routines: {
    // The kid's own run for today (memberId omitted), or a kid's run for one of their parents. null if none yet.
    today: fn({ kind: 'query', day1: 'real', args: { kind: T.routineKind, memberId: v.optional(v.id('members')) }, returns: v.union(routineRunDoc, v.null()) }),
    // The kid's own, or a parent's view of it.
    get: fn({ kind: 'query', day1: 'real', args: { kind: T.routineKind, memberId: v.id('members') }, returns: v.union(routineDoc, v.null()) }),
    // GD backend addendum (pending approval). One run by id (older cards in the thread): the run's kid, or
    // one of that kid's parents. A bedtime step's `source.title` names the household event behind it.
    run: fn({ kind: 'query', day1: 'real', args: { runId: v.id('routineRuns') }, returns: routineRunDoc }),
    // The run's kid only.
    check: fn({ kind: 'mutation', day1: 'real', args: { runId: v.id('routineRuns'), stepId: v.string(), done: v.boolean() }, returns: v.null() }),
    // A parent of the kid. Bedtime's calendar-derived items are added per run, not stored here.
    set: fn({
      kind: 'mutation',
      day1: 'real',
      args: { memberId: v.id('members'), kind: T.routineKind, steps: v.array(T.routineStep), time: v.string(), days: v.array(v.number()) },
      returns: v.null(),
    }),
  },
  bucks: {
    // A kid: their own (memberId omitted). An adult: any kid in the family.
    balance: fn({ kind: 'query', day1: 'real', args: { memberId: v.optional(v.id('members')) }, returns: v.object({ balance: v.number() }) }),
    history: fn({ kind: 'query', day1: 'real', args: { memberId: v.optional(v.id('members')), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(bucksLedgerDoc) }),
    // Adults only (MEGA_BUCKS.releasers); amount within minRelease..maxRelease. The kid is derived from the
    // source (practice set's / chore claim's kid, or `memberId` for a bonus). Idempotent per practice set and
    // per chore claim (a second release returns the first ledger row). Approves a claimed chore. Sends the kid
    // a bucks card.
    // GD backend addendum (pending approval). One ledger row by id (the bucks card): a kid only their own
    // rows; an adult any kid's in the family.
    entry: fn({ kind: 'query', day1: 'real', args: { ledgerId: v.id('bucksLedger') }, returns: bucksLedgerDoc }),
    release: fn({ kind: 'mutation', day1: 'real', args: { source: bucksSource, amount: v.number() }, returns: v.object({ ledgerId: v.id('bucksLedger'), balance: v.number() }) }),
  },
  store: {
    // Kids only (STORE_RULES.shoppers); adults → FORBIDDEN. Every catalog item with owned/wearing for the caller.
    catalog: fn({ kind: 'query', day1: 'real', args: {}, returns: v.object({ balance: v.number(), items: v.array(storeItemView) }) }),
    // Kids only. Refused with VALIDATION if already owned or the balance is short. Writes the purchase and its
    // ledger spend in one mutation. Wearing a look part afterwards is `megas.update`; placing furniture is `rooms.update`.
    buy: fn({ kind: 'mutation', day1: 'real', args: { itemId: T.storeItemId }, returns: v.object({ purchaseId: v.id('purchases'), balance: v.number() }) }),
  },

  // ---------- G4 (CONTRACT v0.15): places, weather, travel time, web search. ----------
  // Search itself has no public function: it's the agent's `web_search` tool (chat.send), whose result is a
  // `search` card in the asker's own thread. The same goes for the `weather` and `travel_time` tools.

  places: {
    // Any member of the family (household data). Sorted home, school, work, then custom by label.
    list: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(placeDoc) }),
    // Adults only (PLACES.editors). Creates (no placeId) or edits a place; a changed address resets
    // `geocode` to pending and queues the Geocoder (Mapbox) in the background. VALIDATION past PLACES limits
    // or for a second `home`.
    upsert: fn({
      kind: 'mutation',
      day1: 'real',
      // v0.16 (G4b): optional `outdoor` (events there get UV and air-quality tips); omitted keeps the current value.
      args: { placeId: v.optional(v.id('places')), kind: T.placeKind, label: v.string(), address: v.string(), outdoor: v.optional(v.boolean()) },
      returns: v.id('places'),
    }),
    // Adults only. Events keep their free-text `place`; their `placeId` is cleared.
    remove: fn({ kind: 'mutation', day1: 'real', args: { placeId: v.id('places') }, returns: v.null() }),
  },
  weather: {
    // Any member. The family's home when placeId is omitted. null when the family has no geocoded place.
    // Reads the cache only (queries can't call out); a stale or missing cache is refreshed by `weather.refresh`
    // and the cron (WEATHER.alertsPollMinutes).
    get: fn({ kind: 'query', day1: 'real', args: { placeId: v.optional(v.id('places')) }, returns: v.union(weatherView, v.null()) }),
    // Any member. Queues a refresh for that place if its cache is past its TTL; otherwise does nothing.
    refresh: fn({ kind: 'mutation', day1: 'real', args: { placeId: v.optional(v.id('places')) }, returns: v.object({ queued: v.boolean() }) }),
  },
  travel: {
    // Members who can see the event (private-layer events: the owner only; NOT_FOUND otherwise, same as
    // events). null until a check has run (within TRAVEL.lookaheadHours of the start).
    forEvent: fn({ kind: 'query', day1: 'real', args: { eventId: v.id('events') }, returns: v.union(travelView, v.null()) }),
    // v0.15a (G4 frontend request). A travel/leave-by card's buttons, for anyone who can see the event (else
    // NOT_FOUND): `on_my_way` stops the pending leave-by push; `snooze_5` re-reminds in 5 minutes;
    // `remind_30_before` (the fallback when travel isn't set up) reminds 30 minutes before the event. Both
    // reminders are plain `reminders` rows for the caller, delivered by the proactive pipeline. The leave-by
    // push's own buttons (on_my_way / snooze_5) take the same path.
    answer: fn({
      kind: 'mutation',
      day1: 'real',
      args: { travelCheckId: v.id('travelChecks'), action: v.union(v.literal('on_my_way'), v.literal('snooze_5'), v.literal('remind_30_before')) },
      returns: v.object({ message: v.string(), remindAt: v.union(v.number(), v.null()) }),
    }),
  },
  search: {
    // The caller's own searches (memberId omitted). A parent may pass their kid's memberId and gets only that
    // kid's `blocked`/`rephrased` rows, and only when the kid's kidControls.tellsParents.blockedSearches is on
    // (FORBIDDEN otherwise). Anyone else → FORBIDDEN. Newest first.
    log: fn({
      kind: 'query',
      day1: 'real',
      args: { memberId: v.optional(v.id('members')), paginationOpts: paginationOptsValidator },
      returns: paginationResultValidator(searchLogDoc),
    }),
  },

  // ---------- G4b (CONTRACT v0.16): shopping, price watch, holidays. Stubs until the G4b backend. ----------
  // Product search has no public function: it's the adults' `shop_search` agent tool, and its result is a
  // `products` card in the asker's own thread. Gift ideas get `productRefs` per idea; `gifts.addToList` starts a
  // price watch for each of the added idea's products.
  shopping: {
    // Adults (SHOPPING.viewers); kids → FORBIDDEN. Looks refs up live in the catalog (≤ SHOPPING.maxLookup; more →
    // VALIDATION) and stores nothing: Shopify's terms forbid caching results. Used by the products, gifts and
    // priceDrop cards.
    products: fn({ kind: 'action', day1: 'stub', args: { refs: v.array(productRef) }, returns: productsResult }),
    // Adults who can see gift ideas, never the gift's recipient: the family's watches with status `watching`.
    watches: fn({ kind: 'query', day1: 'stub', args: {}, returns: v.array(priceWatchDoc) }),
    // Same audience (the recipient and kids → NOT_FOUND). Any status, so a card can say "Stopped watching".
    watch: fn({ kind: 'query', day1: 'stub', args: { watchId: v.id('priceWatches') }, returns: priceWatchDoc }),
    // Same audience. Idempotent: stopping a stopped watch changes nothing. The price push's `stop_watching`
    // button takes the same path.
    unwatch: fn({ kind: 'mutation', day1: 'stub', args: { watchId: v.id('priceWatches') }, returns: v.null() }),
  },
  holidays: {
    // Any member. Public holidays in the next `days` (HOLIDAYS.upcomingDays default, max HOLIDAYS.maxUpcomingDays)
    // for the family's country, from the cache, oldest first, with the family's pause decision.
    upcoming: fn({ kind: 'query', day1: 'stub', args: { days: v.optional(v.number()) }, returns: v.array(upcomingHoliday) }),
    // Adults. The question behind a `holiday` card (any status, so the card can show who decided).
    question: fn({ kind: 'query', day1: 'stub', args: { skipId: v.id('routineSkips') }, returns: routineSkipDoc }),
    // Adults. `pause` skips that day's morning routine and chores for the question's kids (and the bedtime prep
    // the night before says "No school routine tomorrow"); `keep` changes nothing. First answer wins; a later
    // answer returns the existing outcome's message. The push buttons (`holiday.default`) take the same path.
    answer: fn({
      kind: 'mutation',
      day1: 'stub',
      args: { skipId: v.id('routineSkips'), action: v.union(v.literal('pause'), v.literal('keep')) },
      returns: v.object({ message: v.string(), status: T.routineSkipStatus }),
    }),
  },
} as const;

export type ApiModule = keyof typeof API;

/** Push payload `data` (CONTRACT §5). `answerToken` (v0.11, additive): an HMAC-signed, notification- and
 * recipient-scoped token so the background notification-response task (iOS runs it headless, no signed-in
 * session) can call `POST /push/answer` and have the button's effect actually run, instead of silently
 * doing nothing until the app is reopened (PLAN.md's push section flagged this as a day-3 risk). */
export const pushData = v.object({
  v: v.literal(1),
  notificationId: v.id('notifications'),
  kind: notificationKind,
  threadId: v.id('threads'),
  messageId: v.id('messages'),
  answerToken: v.optional(v.string()),
});
export type PushData = Infer<typeof pushData>;

/** Deep links (CONTRACT §6). The app's router and the server's widget/push links both build from these. */
const base = `${IDENTITY.scheme}://`;
export const LINKS = {
  chat: () => `${base}chat`,
  chatMessage: (messageId: string) => `${base}chat/${messageId}`,
  talk: () => `${base}talk`,
  today: () => `${base}today`,
  familyMember: (memberId: string) => `${base}family/${memberId}`,
  hq: (memberId?: string) => (memberId ? `${base}hq/${memberId}` : `${base}hq`),
  join: (token: string) => `${base}join/${token}`,
} as const;
