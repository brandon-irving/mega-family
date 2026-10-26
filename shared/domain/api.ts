// CONTRACT §4. Every public function: its type, args and returns. Backend functions spread these
// (`query({ ...API.today.get, handler })`), so a function can't drift from the contract, and tests
// iterate this map to check every function exists and to generate the privacy grid.
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { type Infer, v } from 'convex/values';
import { IDENTITY } from '../config/identity';
import { notificationKind, personality, platform, reaction, scope, shareLevel, station, themeName, via } from './enums';
import { blockAnswer, spokenMention } from './messages';
import * as T from './tables';
import { withSystemFields } from './validators';

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
    create: fn({ kind: 'mutation', day1: 'real', args: { memberId: v.id('members') }, returns: v.object({ url: v.string(), qrPayload: v.string(), expiresAt: v.number() }) }),
    redeem: fn({ kind: 'mutation', day1: 'real', args: { token: v.string(), parentCode: v.optional(v.string()) }, returns: v.object({ memberId: v.id('members') }) }),
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
      day1: 'stub',
      args: { text: v.string(), mentions: v.optional(v.array(v.id('megas'))), via: v.union(v.literal('text'), v.literal('voice')), attachments: v.optional(v.array(v.id('_storage'))) },
      returns: v.object({ messageId: v.id('messages'), replyMessageId: v.id('messages'), streamId: v.string() }),
    }),
    streamBody: fn({
      kind: 'query',
      day1: 'real',
      args: { streamId: v.string() },
      returns: v.object({ text: v.string(), status: v.union(v.literal('pending'), v.literal('streaming'), v.literal('done'), v.literal('error'), v.literal('timeout')) }),
    }),
    answerBlock: fn({ kind: 'mutation', day1: 'stub', args: { messageId: v.id('messages'), answer: blockAnswer, via }, returns: v.object({ answerMessageId: v.id('messages') }) }),
    react: fn({ kind: 'mutation', day1: 'real', args: { messageId: v.id('messages'), reaction: v.union(reaction, v.null()) }, returns: v.null() }),
  },
  files: {
    uploadUrl: fn({ kind: 'mutation', day1: 'real', args: {}, returns: v.string() }),
  },
  talk: {
    transcribe: fn({ kind: 'action', day1: 'stub', args: { storageId: v.id('_storage') }, returns: v.object({ text: v.string(), mentions: v.array(spokenMention) }) }),
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
      args: { eventId: v.id('events'), patch: v.object({ title: v.optional(v.string()), start: v.optional(v.number()), end: v.optional(v.number()), who: v.optional(v.array(v.id('members'))), place: v.optional(v.string()) }) },
      returns: v.null(),
    }),
    cancel: fn({ kind: 'mutation', day1: 'real', args: { eventId: v.id('events') }, returns: v.null() }),
  },
  lists: {
    all: fn({ kind: 'query', day1: 'real', args: {}, returns: v.array(listSummary) }),
    addItem: fn({ kind: 'mutation', day1: 'real', args: { listId: v.id('lists'), text: v.string() }, returns: v.id('listItems') }),
    check: fn({ kind: 'mutation', day1: 'real', args: { itemId: v.id('listItems'), checked: v.boolean() }, returns: v.null() }),
    remove: fn({ kind: 'mutation', day1: 'real', args: { itemId: v.id('listItems') }, returns: v.null() }),
  },
  requests: {
    respond: fn({ kind: 'mutation', day1: 'stub', args: { requestId: v.id('requests'), accept: v.boolean() }, returns: v.null() }),
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
    answer: fn({
      kind: 'mutation',
      day1: 'stub',
      args: { notificationId: v.id('notifications'), buttonId: v.string(), via: v.union(v.literal('push'), v.literal('block'), v.literal('widget')) },
      returns: v.object({ reply: v.string() }),
    }),
  },
  clock: {
    get: fn({ kind: 'query', day1: 'real', args: {}, returns: v.object({ now: v.number(), mode: T.clocks.mode }) }),
    jump: fn({ kind: 'mutation', day1: 'real', adminOnly: true, args: { to: v.number() }, returns: v.null() }),
  },
} as const;

export type ApiModule = keyof typeof API;

/** Push payload `data` (CONTRACT §5). */
export const pushData = v.object({ v: v.literal(1), notificationId: v.id('notifications'), kind: notificationKind, threadId: v.id('threads'), messageId: v.id('messages') });
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
