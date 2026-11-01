// Test fixtures typed by the contract (shared/domain), built from the sample family labels
// (shared/fixtures/sampleFamily) where useful, so component tests render real contract shapes
// instead of ad-hoc mocks. IDs are fabricated strings cast to the branded Id<Table> type — fine for
// rendering tests, which never talk to Convex.
import type { Id } from '@shared/domain/validators';
import type { MessageBody, SaveChip, UIBlock } from '@shared/domain/messages';
import type { Infer } from 'convex/values';
import type { megaDoc, memberCard, memoryDoc, messageDoc, notificationDoc } from '@shared/domain/api';
import { SAMPLE_FAMILY } from '@shared/fixtures/sampleFamily';
import type { MegaInfo } from '@/features/shell/megaInfo';

const id = <T extends string>(table: T, n: string) => `${table}_${n}` as Id<T>;

export const FIXTURE_IDS = {
  admin: id('members', 'admin'),
  twin1: id('members', 'twin1'),
  teal: id('megas', 'teal'),
  zap: id('megas', 'zap'),
  thread: id('threads', 'main'),
  family: id('families', 'sample'),
};

export const TEAL_MEGA: Infer<typeof megaDoc> = {
  _id: FIXTURE_IDS.teal,
  _creationTime: Date.now(),
  familyId: FIXTURE_IDS.family,
  kind: 'member',
  ownerId: FIXTURE_IDS.admin,
  name: 'Teal',
  look: { hex: SAMPLE_FAMILY.megas[1].hex, sticker: 'star' },
  personality: 'calm',
  job: { station: 'desk', label: 'Math homework', busy: true, since: Date.now() },
};

export const TEAL_INFO: MegaInfo = { name: 'Teal', hex: TEAL_MEGA.look.hex, sticker: 'star', face: 'calm' };

export const ZAP_MEGA: Infer<typeof megaDoc> = {
  ...TEAL_MEGA,
  _id: FIXTURE_IDS.zap,
  name: 'Zap',
  look: { hex: SAMPLE_FAMILY.megas[3].hex, sticker: 'bolt' },
  personality: 'funny',
};

function baseMessage(overrides: Partial<Infer<typeof messageDoc>> & { body: MessageBody }): Infer<typeof messageDoc> {
  return {
    _id: id('messages', Math.random().toString(36).slice(2)),
    _creationTime: Date.now(),
    familyId: FIXTURE_IDS.family,
    threadId: FIXTURE_IDS.thread,
    at: Date.now(),
    author: { kind: 'mega', id: FIXTURE_IDS.teal },
    via: 'text',
    chips: [],
    ...overrides,
  };
}

export const SAMPLE_SAVE_CHIP: SaveChip = { memoryId: id('memories', '1'), scope: 'family', label: 'Family' };

/** One message per MessageBody type, so component tests cover every kind (CONTRACT §3). */
export const MESSAGES_BY_TYPE: Record<MessageBody['type'], Infer<typeof messageDoc>> = {
  text: baseMessage({ author: { kind: 'member', id: FIXTURE_IDS.admin }, body: { type: 'text', text: 'We are out of milk.' } }),
  block: baseMessage({
    body: { type: 'block', block: { kind: 'choice', prompt: 'Who should I add first?', options: [{ id: 'a', label: 'Partner' }], multi: false, allowOther: false } },
  }),
  answer: baseMessage({ author: { kind: 'member', id: FIXTURE_IDS.admin }, body: { type: 'answer', blockMessageId: id('messages', 'q1'), label: 'Partner', value: { optionIds: ['a'] } } }),
  card: baseMessage({ body: { type: 'card', card: { kind: 'weather', summary: 'Clear, 68°F', at: Date.now() } } }),
  file: baseMessage({ body: { type: 'file', storageId: id('_storage', '2'), name: 'Shopping.txt', mimeType: 'text/plain' } }),
  image: baseMessage({ body: { type: 'image', storageId: id('_storage', '1'), caption: 'Grocery receipt' } }),
  notice: baseMessage({ author: { kind: 'system' }, body: { type: 'notice', text: 'From a notification · 2m ago' } }),
};

/** One of every UIBlock kind (CONTRACT §3 / PLAN "Thread UI blocks"). */
export const BLOCKS_BY_KIND: Record<UIBlock['kind'], UIBlock> = {
  megaDraft: { kind: 'megaDraft', prompt: 'Ready to make this MEGA?', draftId: 'draft1' as Id<'megaDrafts'>, revision: 1, data: { target: 'self', megaName: 'Teal', hex: '#2FB8B0', sticker: 'none', personality: 'calm' } },
  choice: { kind: 'choice', prompt: 'Who is Anela to you?', options: [{ id: 'daughter', label: 'Daughter' }, { id: 'son', label: 'Son' }], multi: false, allowOther: true },
  toggle: { kind: 'toggle', prompt: 'Want the whole app in my color?', label: 'Match my MEGA', value: true, preview: 'theme' },
  text: { kind: 'text', prompt: 'What should I call you?', placeholder: 'Name' },
  number: { kind: 'number', prompt: 'How old is Anela?', min: 0, max: 18 },
  date: { kind: 'date', prompt: 'When is practice?', mode: 'time' },
  fields: { kind: 'fields', prompt: 'A few optional details', fields: [{ id: 'birthday', label: 'Birthday', type: 'date' }], skippable: true },
  look: { kind: 'look', prompt: "Pick Anela's MEGA look", value: { hex: '#8E6CE0', sticker: 'bolt', personality: 'funny', name: 'Zap' } },
  questions: { kind: 'questions', prompt: 'Is this OK to ask?', items: [{ id: 'q1', text: 'Is it OK if I call you Anela?', on: true }] },
  invite: { kind: 'invite', memberId: FIXTURE_IDS.twin1 },
  confirm: { kind: 'confirm', prompt: 'Does this look right?', summary: [{ label: 'Name', value: 'Zap' }, { label: 'Color', value: 'Violet' }] },
};

/** One of every Card kind (CONTRACT §3). */
export const CARDS_BY_KIND = {
  event: { kind: 'event' as const, eventId: id('events', '1'), visibleTo: 'family' as const },
  reminder: { kind: 'reminder' as const, reminderId: id('reminders', '1'), visibleTo: 'personal' as const },
  list: { kind: 'list' as const, listId: id('lists', '1'), added: ['Eggs', 'Bread'], visibleTo: 'family' as const },
  search: { kind: 'search' as const, query: 'how tall is Everest', answer: 'About 29,032 feet.', sources: [{ title: 'National Geographic Kids', url: 'https://kids.nationalgeographic.com' }] },
  weather: { kind: 'weather' as const, summary: 'Clear, 68°F', at: Date.now() },
  travel: { kind: 'travel' as const, to: 'Soccer practice', leaveBy: Date.now(), minutes: 12 },
  request: { kind: 'request' as const, requestId: id('requests', '1') },
  notification: { kind: 'notification' as const, notificationId: id('notifications', '1') },
};

/** A request's own notification (CONTRACT: `requests.notificationId`) — title already reads as the
 * asker's phrasing, same shape `notifications.get` (CONTRACT §4 v0.6) returns. */
export const NOTIFICATION_FIXTURE: Infer<typeof notificationDoc> = {
  _id: id('notifications', '1'),
  _creationTime: Date.now(),
  familyId: FIXTURE_IDS.family,
  recipientId: FIXTURE_IDS.admin,
  kind: 'request',
  loudness: 'active',
  title: 'Coral asks',
  body: 'Can you grab milk on your way home?',
  megaId: FIXTURE_IDS.teal,
  buttons: [
    { id: 'yes', label: 'Yes' },
    { id: 'cant', label: "I can't" },
  ],
  sentAt: Date.now(),
};

/** G3 scope: "kid: held for quiet hours" (design board Push.template.html, "Saved from 9:10 PM · quiet
 * hours"). `heldUntil` set, same shape otherwise — this is a kid's reminder sent overnight and held. */
export const NOTIFICATION_HELD_FIXTURE: Infer<typeof notificationDoc> = {
  _id: id('notifications', '2'),
  _creationTime: new Date('2026-10-25T21:10:00').getTime(),
  familyId: FIXTURE_IDS.family,
  recipientId: FIXTURE_IDS.twin1,
  kind: 'reminder',
  loudness: 'timeSensitive',
  title: 'Teal reminds you',
  body: 'Bring your library book today.',
  megaId: FIXTURE_IDS.teal,
  buttons: [
    { id: 'on_my_way', label: 'On my way' },
    { id: 'snooze_5', label: 'Snooze 5 min' },
  ],
  heldUntil: new Date('2026-10-26T07:00:00').getTime(),
};

export const MEMBER_CARD_FIXTURE: Infer<typeof memberCard> = {
  member: {
    _id: FIXTURE_IDS.admin,
    _creationTime: Date.now(),
    familyId: FIXTURE_IDS.family,
    name: 'Admin',
    role: 'admin',
    activities: [],
    hasMega: true,
    joinedAt: Date.now(),
  },
  mega: TEAL_MEGA,
  status: { station: 'desk', label: 'Math homework', busy: true },
};

export const MEMORY_FIXTURE: Infer<typeof memoryDoc> = {
  _id: id('memories', '1'),
  _creationTime: Date.now(),
  familyId: FIXTURE_IDS.family,
  scope: 'family',
  scopeKey: 'family',
  about: [],
  kind: 'fact',
  text: 'Trash and recycling go out Tuesday night.',
  source: { kind: 'onboarding' },
  trigger: 'explicit',
  confidence: 1,
  confirmed: true,
  sensitive: false,
  pinned: true,
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
};
