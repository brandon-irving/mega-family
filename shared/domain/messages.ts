// CONTRACT §3. Chat message bodies, thread UI blocks, block answers, cards and save chips.
import { type Infer, v } from 'convex/values';
import { personality, scope } from './enums';

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
  v.object({ kind: v.literal('search'), query: v.string(), answer: v.string(), sources: v.array(v.object({ title: v.string(), url: v.string() })) }),
  v.object({ kind: v.literal('weather'), summary: v.string(), at: v.number() }),
  v.object({ kind: v.literal('travel'), to: v.string(), leaveBy: v.number(), minutes: v.number() }),
  v.object({ kind: v.literal('request'), requestId: v.id('requests') }),
  v.object({ kind: v.literal('notification'), notificationId: v.id('notifications') }),
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
