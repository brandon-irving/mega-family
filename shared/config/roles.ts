// What each role sees and may use. Permissions are still checked on the server; this drives UI and tool lists.
import type { Role } from '../domain/enums';

export const TABS = ['chat', 'ideas', 'hq', 'family'] as const;
export type Tab = (typeof TABS)[number];

export const TOOLS = [
  'recall', 'remember', 'events', 'reminders', 'lists', 'ask_member', 'show_ui',
  'web_search', 'weather', 'travel_time', 'make_image', 'follow_up',
  // G4b (v0.16): catalog product search, adults only (kids' list below leaves it out; SHOPPING.viewers).
  'shop_search', 'ideas', 'mega_creation',
] as const;
export type Tool = (typeof TOOLS)[number];

/** What the MEGA profile offers (owner, Oct 28): `rename` the MEGA; see and forget its `memories`; set
 * `sharing`; pick from `allLooks` (adults) or only what they own (kids, STORE_RULES). */
export type ProfileAccess = { rename: boolean; memories: boolean; sharing: boolean; allLooks: boolean };

export const ROLES_CONFIG: Record<Role, { tabs: readonly Tab[]; tools: readonly Tool[]; bigTargets: boolean; talkButton: boolean; profile: ProfileAccess }> = {
  admin: { tabs: ['chat', 'ideas', 'hq', 'family'], tools: TOOLS, bigTargets: false, talkButton: false, profile: { rename: true, memories: true, sharing: true, allLooks: true } },
  adult: { tabs: ['chat', 'ideas', 'hq', 'family'], tools: TOOLS, bigTargets: false, talkButton: false, profile: { rename: true, memories: true, sharing: true, allLooks: true } },
  kid: {
    tabs: ['chat', 'hq'],
    tools: ['recall', 'remember', 'reminders', 'lists', 'show_ui', 'web_search', 'weather', 'follow_up'],
    bigTargets: true,
    talkButton: true,
    // Kids keep the name their grown-up gave their MEGA, and don't get memory or sharing controls (PLAN §3).
    profile: { rename: false, memories: false, sharing: false, allLooks: false },
  },
};
