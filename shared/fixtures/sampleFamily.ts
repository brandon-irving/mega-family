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
};
