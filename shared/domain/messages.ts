// CONTRACT §3. Chat message bodies, thread UI blocks, block answers, cards and save chips.
import { type Infer, v } from 'convex/values';
import { personality, scope } from './enums';
import { ALERT_SEVERITIES, INTEGRATION_FAILURES, SEARCH_OUTCOMES, WEATHER_TIPS } from '../config/ids';
import { productRef } from './integrationShapes';
import { literals } from './validators';

const option = v.object({ id: v.string(), label: v.string() });

export const uiBlock = v.union(
  v.object({ kind: v.literal('choice'), prompt: v.string(), options: v.array(option), multi: v.boolean(), allowOther: v.boolean() }),
  v.object({ kind: v.literal('toggle'), prompt: v.string(), label: v.string(), value: v.boolean(), preview: v.optional(v.literal('theme')) }),
  v.object({ kind: v.literal('text'), prompt: v.string(), placeholder: v.optional(v.string()) }),
  v.object({ kind: v.literal('number'), prompt: v.string(), min: v.optional(v.number()), max: v.optional(v.number()) }),
  v.object({ kind: v.literal('date'), prompt: v.string(), mode: v.union(v.literal('date'), v.literal('time'), v.literal('datetime')) }),
  v.object({
    kind: v.literal('fields'),
    prompt: v.string(),
    fields: v.array(v.object({ id: v.string(), label: v.string(), type: v.union(v.literal('text'), v.literal('date'), v.literal('number')) })),
    skippable: v.literal(true),
  }),
  v.object({
    kind: v.literal('look'),
    prompt: v.string(),
    forMemberId: v.optional(v.id('members')),
    value: v.optional(v.object({ hex: v.string(), sticker: v.string(), personality, name: v.string() })),
  }),
  v.object({
    kind: v.literal('questions'),
    prompt: v.string(),
    items: v.array(v.object({ id: v.string(), text: v.string(), default: v.optional(v.string()), on: v.boolean() })),
  }),
  v.object({ kind: v.literal('invite'), memberId: v.id('members') }),
  v.object({ kind: v.literal('confirm'), prompt: v.string(), summary: v.array(v.object({ label: v.string(), value: v.string() })) }),
);
export type UIBlock = Infer<typeof uiBlock>;
export type UIBlockKind = UIBlock['kind'];

export const blockAnswer = v.object({
  optionIds: v.optional(v.array(v.string())),
  other: v.optional(v.string()),
  value: v.optional(v.union(v.string(), v.number(), v.boolean())),
  fields: v.optional(v.record(v.string(), v.string())),
  skipped: v.optional(v.literal(true)),
});
export type BlockAnswer = Infer<typeof blockAnswer>;

export const card = v.union(
  v.object({ kind: v.literal('event'), eventId: v.id('events'), visibleTo: scope }),
  v.object({ kind: v.literal('reminder'), reminderId: v.id('reminders'), visibleTo: scope }),
  v.object({ kind: v.literal('list'), listId: v.id('lists'), added: v.optional(v.array(v.string())), visibleTo: scope }),
  // G4 (CONTRACT v0.15): the search, weather and travel cards keep their content inline (they're written only
  // into the thread of the member who asked or who the reminder is for). New fields are all optional (additive).
  v.object({
    kind: v.literal('search'),
    query: v.string(),
    answer: v.string(),
    sources: v.array(v.object({ title: v.string(), url: v.string() })),
    /** v0.15: what the (kid) filter did. `blocked` → `answer` is KID_SAFETY.blockedMessage and no sources. */
    outcome: v.optional(literals(SEARCH_OUTCOMES)),
    /** v0.15: the age-appropriate query actually searched, when `outcome` is `rephrased`. */
    rephrasedTo: v.optional(v.string()),
    searchLogId: v.optional(v.id('searchLog')),
    /** v0.15a: on a kid's blocked card, whether their parents were told (kidControls.tellsParents.blockedSearches). */
    parentsTold: v.optional(v.boolean()),
  }),
  v.object({
    kind: v.literal('weather'),
    summary: v.string(),
    at: v.number(),
    /** v0.15 (all optional): where, the next hours, today's range, and an NWS alert when this card is one. */
    placeLabel: v.optional(v.string()),
    hours: v.optional(v.array(v.object({ at: v.number(), tempF: v.number(), precipPct: v.number(), code: v.number() }))),
    highF: v.optional(v.number()),
    lowF: v.optional(v.number()),
    alert: v.optional(v.object({ event: v.string(), headline: v.string(), severity: literals(ALERT_SEVERITIES), ends: v.optional(v.number()) })),
    eventId: v.optional(v.id('events')),
    /** v0.15a: the current temperature (Open-Meteo `current` block), rounded °F. */
    nowF: v.optional(v.number()),
    /** v0.16 (G4b): air quality and UV (Open-Meteo air-quality API). `usAqi` is the US AQI now (or at the event's
     * start for a tip), `uvIndexMax` today's peak UV, `uvAt` the UV at the event's start for a tip. */
    air: v.optional(v.object({ usAqi: v.optional(v.number()), uvIndexMax: v.optional(v.number()), uvAt: v.optional(v.number()) })),
    /** v0.16: which event tip this card is ("rain" is G4's "Rain at pickup"). Absent on a plain forecast card. */
    tip: v.optional(literals(WEATHER_TIPS)),
  }),
  v.object({
    kind: v.literal('travel'),
    to: v.string(),
    leaveBy: v.number(),
    minutes: v.number(),
    /** v0.15 (all optional): the event and places behind it, and Mapbox's typical (traffic-free) minutes. */
    eventId: v.optional(v.id('events')),
    fromLabel: v.optional(v.string()),
    typicalMinutes: v.optional(v.number()),
    checkId: v.optional(v.id('travelChecks')),
    /** Set instead of a real time when travel can't be checked (e.g. `not_configured`: no MAPBOX_TOKEN). The
     * card then shows INTEGRATION_COPY, never a made-up `minutes`/`leaveBy` (both 0). */
    failure: v.optional(literals(INTEGRATION_FAILURES)),
    /** v0.15a: the event behind the trip ("· Soccer pickup", "starts at 5:30 PM"). */
    eventTitle: v.optional(v.string()),
    eventStart: v.optional(v.number()),
  }),
  v.object({ kind: v.literal('request'), requestId: v.id('requests') }),
  v.object({ kind: v.literal('notification'), notificationId: v.id('notifications') }),
  // GD (CONTRACT v0.13, additive). Each card holds only an id; the app loads it with the matching query,
  // which re-checks the viewer, so a card in a thread never carries content its reader can't see.
  v.object({ kind: v.literal('homework'), sheetId: v.id('homeworkSheets') }), // parent: "That's a fractions worksheet… make practice?"
  v.object({ kind: v.literal('practice'), setId: v.id('practiceSets') }), // kid: the practice thread; parent: the summary + release
  v.object({ kind: v.literal('chore'), claimId: v.id('choreClaims') }), // kid: Done; parent: approve + release
  v.object({ kind: v.literal('routine'), runId: v.id('routineRuns') }), // kid: morning steps / bedtime prep
  v.object({ kind: v.literal('bucks'), ledgerId: v.id('bucksLedger') }), // kid: "Admin released 5 Mega Bucks!"
  v.object({ kind: v.literal('shareSuggestion'), suggestionId: v.id('shareSuggestions') }), // owner only
  v.object({ kind: v.literal('proposal'), proposalId: v.id('proposals') }), // Hub's clash fix, before/after
  v.object({ kind: v.literal('gifts'), giftIdeasId: v.id('giftIdeas') }), // adults, never the birthday person
  // CONTRACT v0.13b (additive): a kid's first-open "Here's what we can do" (board KidsIntro). No id: the rows
  // are config (shared/config/starters.ts KID_INTRO), the same for every kid.
  v.object({ kind: v.literal('intro') }),
  // CONTRACT v0.16 (G4b, additive). `products` keeps only product refs (Shopify's catalog terms forbid caching
  // results): the app reads current details with `shopping.products`. Written only into the asking adult's own
  // thread (the `shop_search` tool). `failure` instead of refs when the catalog couldn't answer.
  v.object({ kind: v.literal('products'), query: v.string(), refs: v.array(productRef), failure: v.optional(literals(INTEGRATION_FAILURES)) }),
  v.object({ kind: v.literal('priceDrop'), watchId: v.id('priceWatches') }), // adults who can see the gift ideas, never the recipient
  v.object({ kind: v.literal('holiday'), skipId: v.id('routineSkips') }), // adults: "Pause the morning routine and chores?"
);
export type Card = Infer<typeof card>;

export const messageBody = v.union(
  v.object({ type: v.literal('text'), text: v.string(), mentions: v.optional(v.array(v.id('megas'))) }),
  v.object({ type: v.literal('block'), block: uiBlock, answeredWith: v.optional(blockAnswer) }),
  v.object({ type: v.literal('answer'), blockMessageId: v.id('messages'), label: v.string(), value: blockAnswer }),
  v.object({ type: v.literal('card'), card }),
  v.object({ type: v.literal('image'), storageId: v.id('_storage'), caption: v.optional(v.string()) }),
  v.object({ type: v.literal('notice'), text: v.string() }),
);
export type MessageBody = Infer<typeof messageBody>;

export const author = v.union(
  v.object({ kind: v.literal('member'), id: v.id('members') }),
  v.object({ kind: v.literal('mega'), id: v.id('megas') }),
  v.object({ kind: v.literal('system') }),
);
export type Author = Infer<typeof author>;

/** "Saved · Family" under a message. Tapping it changes the scope or forgets the memory. */
export const saveChip = v.object({ memoryId: v.id('memories'), scope, label: v.string() });
export type SaveChip = Infer<typeof saveChip>;

/** A MEGA name heard in speech (added in contract v0.2). start/end are character offsets into the text. */
export const spokenMention = v.object({ megaId: v.id('megas'), heard: v.string(), start: v.number(), end: v.number(), confidence: v.number() });
export type SpokenMention = Infer<typeof spokenMention>;
