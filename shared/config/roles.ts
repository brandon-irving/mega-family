// What each role sees and may use. Permissions are still checked on the server; this drives UI and tool lists.
import type { Role } from '../domain/enums';

export const TABS = ['chat', 'hq', 'family'] as const;
export type Tab = (typeof TABS)[number];

export const TOOLS = [
  'recall', 'remember', 'events', 'reminders', 'lists', 'ask_member', 'show_ui',
  'web_search', 'weather', 'travel_time', 'make_image', 'follow_up',
] as const;
export type Tool = (typeof TOOLS)[number];

export const ROLES_CONFIG: Record<Role, { tabs: readonly Tab[]; tools: readonly Tool[]; bigTargets: boolean; talkButton: boolean }> = {
  admin: { tabs: ['chat', 'hq', 'family'], tools: TOOLS, bigTargets: false, talkButton: false },
  adult: { tabs: ['chat', 'hq', 'family'], tools: TOOLS, bigTargets: false, talkButton: false },
  kid: {
    tabs: ['chat', 'hq'],
    tools: ['recall', 'remember', 'reminders', 'lists', 'show_ui', 'web_search', 'weather', 'follow_up'],
    bigTargets: true,
    talkButton: true,
  },
};
