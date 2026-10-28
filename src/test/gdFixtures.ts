// GD (CONTRACT v0.13) fixtures for the Screen 10–12 views, shaped exactly like the contract's view models.
// Synthetic only, generic sample labels (Admin, Partner, Twin 1, Twin 2; MEGAs Teal, Coral, Zap, Sunny; Hub).
import type { CatalogItem, Look } from '@/features/store/storeModel';
import type { PracticeView } from '@/features/kids/PracticeCard';
import type { ChoreView } from '@/features/kids/ChoreCard';
import type { ProposalView } from '@/features/calendar/ProposalCard';
import type { GiftIdeas } from '@/features/calendar/GiftsCard';
import type { EventDoc } from '@/features/family/CalendarContent';

const id = <T,>(s: string) => s as unknown as T;
export const IDS = { admin: 'm_admin', partner: 'm_partner', twin1: 'm_twin1', twin2: 'm_twin2' } as const;

export const PRACTICE_READY: PracticeView = {
  setId: id('ps_1'),
  forMemberId: id(IDS.twin1),
  status: 'ready',
  topic: 'Fractions',
  questions: [
    { id: 'q1', prompt: 'What is 1/2 + 1/4?', choices: ['2/6', '3/4', '1/6', '2/8'], answered: { correct: true, tries: 1 } },
    { id: 'q2', prompt: 'What is 1/3 + 1/3?', choices: ['2/6', '1/9', '2/3', '1/3'], answered: null },
    { id: 'q3', prompt: 'What is 3/4 − 1/4?', choices: ['1/2', '4/4', '3/16', '2/0'], answered: null },
  ],
  released: null,
  canRelease: false,
};

export const PRACTICE_HINTED: PracticeView = {
  ...PRACTICE_READY,
  questions: PRACTICE_READY.questions.map((q) => (q.id === 'q2' ? { ...q, hint: 'The bottoms already match. What happens to the tops?' } : q)),
};

export const PRACTICE_DONE: PracticeView = {
  ...PRACTICE_READY,
  status: 'done',
  questions: PRACTICE_READY.questions.map((q) => ({ ...q, answered: { correct: true, tries: 1 } })),
  summary: { correct: 2, total: 3, hintsUsed: 2, minutes: 12, note: 'Adding fractions with different bottoms took a hint.' },
  canRelease: true,
};

export const CHORE_DUE: ChoreView = {
  chore: { _id: id('ch_1'), _creationTime: 0, familyId: id('f'), forMemberId: id(IDS.twin2), title: 'Dishes after dinner', bucks: 3, days: [0, 1, 2, 3, 4, 5, 6], time: '19:00', createdBy: id(IDS.admin), active: true },
  today: { _id: id('cc_1'), _creationTime: 0, familyId: id('f'), choreId: id('ch_1'), forMemberId: id(IDS.twin2), date: '2026-10-29', status: 'due' },
};

export const CHORE_CLAIMED: ChoreView = { ...CHORE_DUE, today: { ...CHORE_DUE.today!, status: 'claimed', claimedAt: Date.UTC(2026, 9, 29, 23, 42) } };

const before: ProposalView['proposal']['before'] = { eventId: id('ev_pickup'), title: 'Soccer pickup', start: Date.UTC(2026, 9, 29, 21, 30), who: [id(IDS.partner)] };
export const PROPOSAL_PENDING: ProposalView = {
  proposal: {
    _id: id('pr_1'),
    _creationTime: 0,
    familyId: id('f'),
    collisionId: id('co_1'),
    megaId: id('mg_hub'),
    fix: { kind: 'reassign', eventId: id('ev_pickup'), from: id(IDS.partner), to: id(IDS.admin) },
    title: 'Partner can’t be at soccer pickup',
    text: 'Partner’s work dinner overlaps soccer pickup at 5:30. One fix:',
    before,
    after: { ...before, who: [id(IDS.admin)] },
    wordedBy: 'model:muse-wonder-1.0',
    reasonedBy: 'model:muse-spark-1.3',
    audience: [id(IDS.admin), id(IDS.partner), id(IDS.twin1), id(IDS.twin2)],
    status: 'pending',
    createdAt: 0,
    expiresAt: 1,
  },
  mega: { megaId: id('mg_hub'), name: 'Hub', hex: '#5B8DEF', sticker: 'none' },
  disclosure: 'Hub · your family’s MEGA (AI). Nothing changes until Admin approves.',
  clashEventIds: [id('ev_pickup'), id('ev_dinner')],
};

export const GIFTS_READY: GiftIdeas = {
  _id: id('gi_1'),
  _creationTime: 0,
  familyId: id('f'),
  forMemberId: id(IDS.twin1),
  occasion: 'birthday',
  date: '2026-11-08',
  basedOn: [
    { label: 'Twin 1 shared: loves dinosaurs', source: { kind: 'memory', memoryId: id('me_1') } },
    { label: 'Family notes: into building sets', source: { kind: 'memory', memoryId: id('me_2') } },
  ],
  ideas: [
    { title: 'Dinosaur skeleton building set', why: 'Dinosaurs + building', price: 'about $35', basedOn: [0, 1] },
    { title: 'Dig-your-own fossil kit', why: 'Loves dinosaurs', price: 'about $20', basedOn: [0] },
  ],
  status: 'ready',
  createdAt: 0,
  addedToList: [1],
};

export const ZAP_LOOK: Look = { hex: '#8E6CE0', sticker: 'bolt' };

export const CATALOG: CatalogItem[] = [
  { id: 'furniture:bed', label: 'Bed', price: 0, owned: true, wearing: false },
  { id: 'furniture:plant', label: 'Plant', price: 4, owned: true, wearing: false },
  { id: 'furniture:beanbag', label: 'Beanbag', price: 8, owned: false, wearing: false },
  { id: 'sticker:bolt', label: 'Bolt', price: 5, owned: true, wearing: true },
  { id: 'sticker:star', label: 'Star', price: 5, owned: false, wearing: false },
  { id: 'color:bubblegum', label: 'Bubblegum', price: 10, hex: '#F28AC0', owned: false, wearing: false },
  { id: 'antenna:star', label: 'Star', price: 12, owned: false, wearing: false },
  { id: 'eyes:anime', label: 'Anime', price: 15, owned: false, wearing: false },
  { id: 'eyeColor:pink', label: 'Pink', price: 10, hex: '#FF9AD5', owned: false, wearing: false },
];

const ev = (over: Partial<EventDoc> & Pick<EventDoc, 'title' | 'start' | 'scope'>): EventDoc => ({
  _id: id(`ev_${over.title}`),
  _creationTime: 0,
  familyId: id('f'),
  who: [],
  source: 'mega',
  cancelled: false,
  ...over,
});
/** Thursday of a week starting Sunday Oct 25, 2026 (local time). */
export const WEEK_START = new Date(2026, 9, 25).getTime();
const thu = (h: number, m = 0) => new Date(2026, 9, 29, h, m).getTime();
export const THURSDAY_EVENTS: EventDoc[] = [
  ev({ title: 'Dentist', start: thu(16), end: thu(17), scope: 'personal', ownerId: id(IDS.admin), who: [id(IDS.admin)] }),
  ev({ title: 'Soccer practice', start: thu(16, 30), end: thu(17, 30), scope: 'family', who: [id(IDS.twin1), id(IDS.twin2)] }),
  ev({ _id: id('ev_pickup'), title: 'Soccer pickup', start: thu(17, 30), scope: 'family', who: [id(IDS.partner)] }),
];
export const CAL_MEMBERS = [
  { _id: IDS.admin, name: 'Admin', hex: '#2FB8B0' },
  { _id: IDS.partner, name: 'Partner', hex: '#F2766B' },
  { _id: IDS.twin1, name: 'Twin 1', hex: '#8E6CE0' },
];
