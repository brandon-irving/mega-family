// The sample family (CONTRACT §10). Generic labels only; never real details about the user's family.
// Times are minutes after midnight on days relative to the seed week's Sunday.
import type { StickerId } from '../config/looks';
import type { MegaKind, MemoryKind, Personality, Relationship, Role, Scope } from '../domain/enums';

export type SampleKey = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

export const SAMPLE_FAMILY = {
  name: 'Sample Family',
  timezone: 'America/New_York',
  parentCode: '48217',
  /** The demo clock starts on Sunday at 4:42 PM, as in the mockups. */
  start: { day: 0, minutes: 16 * 60 + 42 },
  members: [
    { key: 'admin', name: 'Admin', role: 'admin', login: true, activities: [] },
    { key: 'partner', name: 'Partner', role: 'adult', login: true, activities: [] },
    { key: 'twin1', name: 'Twin 1', role: 'kid', login: true, grade: '5th', activities: ['Soccer'] },
    { key: 'twin2', name: 'Twin 2', role: 'kid', login: true, grade: '5th', activities: ['Soccer'] },
    { key: 'toddler', name: 'Toddler', role: 'kid', login: false, activities: [] },
  ] as { key: SampleKey; name: string; role: Role; login: boolean; grade?: string; activities: string[] }[],
  /** [from, to, kind]: "from is to's <kind>". */
  relationships: [
    ['admin', 'partner', 'partner'],
    ['partner', 'admin', 'partner'],
    ['twin1', 'admin', 'child'], ['twin1', 'partner', 'child'],
    ['twin2', 'admin', 'child'], ['twin2', 'partner', 'child'],
    ['toddler', 'admin', 'child'], ['toddler', 'partner', 'child'],
    ['admin', 'twin1', 'parent'], ['partner', 'twin1', 'parent'],
    ['admin', 'twin2', 'parent'], ['partner', 'twin2', 'parent'],
    ['admin', 'toddler', 'parent'], ['partner', 'toddler', 'parent'],
  ] as [SampleKey, SampleKey, Relationship][],
  megas: [
    { owner: null, kind: 'family', name: 'Hub', hex: '#9AA1AB', sticker: 'none', personality: 'calm' },
    { owner: 'admin', kind: 'member', name: 'Teal', hex: '#2FB8B0', sticker: 'star', personality: 'calm' },
    { owner: 'partner', kind: 'member', name: 'Coral', hex: '#F2766B', sticker: 'heart', personality: 'cheerful' },
    { owner: 'twin1', kind: 'member', name: 'Zap', hex: '#8E6CE0', sticker: 'bolt', personality: 'funny' },
    { owner: 'twin2', kind: 'member', name: 'Sunny', hex: '#F2B33D', sticker: 'leaf', personality: 'cheerful' },
    { owner: 'toddler', kind: 'care', name: 'Pebble', hex: '#5BBF6A', sticker: 'none', personality: 'calm' },
  ] as { owner: SampleKey | null; kind: MegaKind; name: string; hex: string; sticker: StickerId; personality: Personality }[],
  /** The mockups' week: [day (0 = Sunday), minutes, title, who]. */
  events: [
    [0, 16 * 60 + 50, 'Soccer pickup', ['admin']],
    [0, 17 * 60 + 30, 'Soccer practice ends', ['twin1', 'twin2']],
    [0, 19 * 60, 'Dinner', 'all'],
    [0, 20 * 60 + 30, 'Reading time', ['twin1', 'twin2']],
    [1, 8 * 60, 'School drop-off', ['partner']],
    [1, 18 * 60, 'Soccer practice', ['twin1', 'twin2']],
    [2, 19 * 60 + 30, 'Recycling out', ['admin']],
    [3, 18 * 60, 'Soccer practice', ['twin1', 'twin2']],
    [3, 19 * 60, 'Dinner out', 'all'],
    [5, 18 * 60 + 30, 'Movie night', 'all'],
    [6, 17 * 60, 'Halloween costumes on', 'all'],
    [6, 18 * 60, 'Trick-or-treating', 'all'],
  ] as [number, number, string, SampleKey[] | 'all'][],
  lists: [{ name: 'Groceries', scope: 'family', items: ['Eggs', 'Bread', 'Apples'] }] as { name: string; scope: Scope; items: string[] }[],
  /** One or more memories in every scope, so the privacy tests have something to leak. */
  memories: [
    { scope: 'family', about: [], kind: 'fact', text: 'Trash and recycling go out Tuesday night.', pinned: true },
    { scope: 'family', about: ['twin1', 'twin2'], kind: 'routine', text: 'Soccer practice is Monday and Wednesday at 6 PM.', pinned: false },
    { scope: 'adults', about: [], kind: 'plan', text: 'Saving up for a family trip in the spring.', pinned: false },
    { scope: 'personal', owner: 'admin', about: ['admin'], kind: 'style', text: 'Prefers reminders 10 minutes earlier than usual.', pinned: false },
    { scope: 'personal', owner: 'partner', about: ['partner'], kind: 'preference', text: 'Likes a heads-up the night before school events.', pinned: false },
    { scope: 'personal', owner: 'twin1', about: ['twin1'], kind: 'preference', text: 'Asked for a space fact with homework help.', pinned: false },
    { scope: 'personal', owner: 'twin2', about: ['twin2'], kind: 'note', text: 'Library book is due Thursday.', pinned: false },
    { scope: 'shared', owner: 'admin', grantees: ['partner'], about: ['admin'], kind: 'preference', text: 'Tell Partner when Admin is running late.', pinned: false },
    { scope: 'adults', owner: 'toddler', about: ['toddler'], kind: 'routine', text: 'Toddler naps from 1 to 3 PM.', pinned: false },
  ] as { scope: Scope; owner?: SampleKey; grantees?: SampleKey[]; about: SampleKey[]; kind: MemoryKind; text: string; pinned: boolean }[],
  request: { from: 'partner', to: 'admin', text: 'We are out of milk. Can you grab some on the way home?' } as { from: SampleKey; to: SampleKey; text: string },
  /** A kid reminder that fell in quiet hours and is held until morning. */
  heldReminder: { for: 'twin2', text: 'Return the library book', day: 0, minutes: 21 * 60 + 10 } as { for: SampleKey; text: string; day: number; minutes: number },
  statement: { for: 'admin', text: 'Recycling goes out Tuesday. Want a reminder Monday night?' } as { for: SampleKey; text: string },

  /** GD (Screens 10–12 boards). Synthetic only. Days are relative to the seed week's Sunday. */
  gd: {
    /** Twin 1's birthday: the Sunday two weeks after the seed week's (board CalGifts: "Sunday, November 8"
     * for the Oct 25 week). Stored with a birth year; the gift trigger uses the next occurrence. */
    birthdays: [{ key: 'twin1', daysFromSunday: 14, age: 11 }] as { key: SampleKey; daysFromSunday: number; age: number }[],
    /** What's been shared with the household that gift ideas may cite (family/adults scope only). */
    sharedFacts: [
      { scope: 'family', owner: 'twin1', about: ['twin1'], kind: 'preference', text: 'Loves dinosaurs.' },
      { scope: 'family', about: ['twin1'], kind: 'preference', text: 'Into building sets.' },
      { scope: 'adults', owner: 'partner', about: ['partner'], kind: 'plan', text: 'Gift budget is about $40 per kid.' },
    ] as { scope: Scope; owner?: SampleKey; about: SampleKey[]; kind: MemoryKind; text: string }[],
    /** Thursday (board CalClash / CalPartner / Calendar). `layer` decides the scope; private events have an
     * owner and are visible to nobody else. The work dinner was Partner's own private event until Partner
     * shared it (a shareActions row). */
    events: [
      { key: 'practice', day: 4, start: 16 * 60, end: 17 * 60, title: 'Soccer practice', who: ['twin1', 'twin2'], layer: 'household', owner: 'admin' },
      { key: 'pickup', day: 4, start: 17 * 60 + 30, end: 17 * 60 + 45, title: 'Soccer pickup', who: ['partner'], layer: 'household', owner: 'admin' },
      { key: 'dinner', day: 4, start: 17 * 60, end: 19 * 60, title: 'Work dinner', who: ['partner'], layer: 'household', owner: 'partner', sharedByOwner: true },
      { key: 'dentist', day: 4, start: 16 * 60, end: 17 * 60, title: 'Dentist', who: ['admin'], layer: 'private', owner: 'admin' },
      { key: 'haircut', day: 4, start: 12 * 60, end: 12 * 60 + 45, title: 'Haircut', who: ['partner'], layer: 'private', owner: 'partner' },
    ] as { key: string; day: number; start: number; end: number; title: string; who: SampleKey[]; layer: 'household' | 'private'; owner: SampleKey; sharedByOwner?: boolean }[],
    /** The seeded clash proposal (so the board renders without waiting on a model): Admin takes pickup. */
    proposal: {
      title: 'Admin takes soccer pickup on Thursday',
      text: 'Partner’s work dinner runs 5 to 7, so Admin picks the twins up at 5:30 instead.',
    },
    chores: [
      { key: 'dishes', for: 'twin2', title: 'Dishes', bucks: 3, time: '19:00' },
      { key: 'fish', for: 'twin1', title: 'Feed the fish', bucks: 3, time: '08:00' },
    ] as { key: string; for: SampleKey; title: string; bucks: number; time: string }[],
    /** Today's Dishes claim is waiting for an adult (board KidsChoreApprove). */
    claimedChore: 'dishes',
    /** Twin 2's bedtime list for Thursday's soccer practice (board KidsBedtime), seeded so the demo doesn't
     * wait for the bedtime sweep's model call. Items come only from the household event. */
    bedtimeRun: {
      for: 'twin2' as SampleKey,
      event: 'practice',
      items: [
        { id: 'cleats', label: 'Soccer cleats', detail: 'By the back door' },
        { id: 'shin', label: 'Shin guards' },
        { id: 'bottle', label: 'Water bottle', detail: 'Fill it in the morning' },
      ] as { id: string; label: string; detail?: string }[],
    },
    /** Twin 1's finished practice set from the fractions sheet (board KidsSummary: 4 of 5, 2 hints). */
    practice: {
      for: 'twin1' as SampleKey,
      by: 'admin' as SampleKey,
      questions: [
        { prompt: 'What is 1/2 + 1/4?', choices: ['2/6', '3/4', '1/8', '2/4'], answerIndex: 1, hint: 'Can you write 1/2 with a bottom of 4 first?' },
        { prompt: 'What is 1/2 + 3/8?', choices: ['4/10', '4/8', '7/8', '3/16'], answerIndex: 2, hint: 'How many eighths make one half?' },
        { prompt: 'What is 1/3 + 1/3?', choices: ['2/6', '1/9', '2/3', '1/3'], answerIndex: 2, hint: 'When the bottoms match, which part do you add?' },
        { prompt: 'What is 2/5 + 1/10?', choices: ['3/15', '1/2', '3/10', '2/50'], answerIndex: 1, hint: 'What is 2/5 written in tenths?' },
        { prompt: 'What is 3/4 - 1/4?', choices: ['2/4', '2/0', '1/4', '4/4'], answerIndex: 0, hint: 'The bottoms are the same. What happens to the tops?' },
      ],
      /** Index of the question missed (after 2 tries), and the questions where a hint was used. */
      missed: [3],
      hinted: [1, 3],
      minutes: 12,
      note: 'Fractions with different bottoms took 2 hints.',
    },
    /** Mega Bucks history: Twin 1 owns the plant and has 3 left (board StoreEyes, "Need 12 more" for the
     * anime eyes). StoreConfirm's 12 is the other board state; we seed 3. */
    bucks: [
      { for: 'twin1', by: 'admin', delta: 5, note: 'Spelling practice' },
      { for: 'twin1', by: 'partner', delta: 2, note: 'Helped with groceries' },
      { for: 'twin2', by: 'admin', delta: 4, note: 'Tidied the room' },
    ] as { for: SampleKey; by: SampleKey; delta: number; note: string }[],
    purchases: [{ for: 'twin1', itemId: 'furniture:plant' }] as { for: SampleKey; itemId: 'furniture:plant' }[],
    /** The board's ready gift ideas (CalGifts). `basedOn` indexes `sharedFacts` (0, 1, 2) and, as 3, Twin 1's
     * listed activities. A live sweep never redrafts these (one set per birthday). */
    gifts: {
      for: 'twin1' as SampleKey,
      facts: [0, 1, 2, 'activities'] as (number | 'activities')[],
      ideas: [
        { title: 'Dinosaur building kit', why: 'Dinosaurs and building sets in one box.', price: '$35', basedOn: [0, 1, 2] },
        { title: 'Glow-in-the-dark dinosaur poster', why: 'For the dinosaur fan, under budget.', price: '$15', basedOn: [0, 2] },
        { title: 'Soccer ball with their name on it', why: 'They play soccer twice a week.', price: '$25', basedOn: [3, 2] },
      ],
    },
    /** Today's morning list for Twin 1, half done (board KidsMorning). */
    morningRun: { for: 'twin1' as SampleKey, doneSteps: ['dressed', 'teeth'] },
  },
};
