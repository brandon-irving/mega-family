// Which tabs a role sees (ROLES_CONFIG[role].tabs, config/roles.ts) mapped to route names and
// labels. Both the native and web tab layouts read this, so adding a tab is a config edit.
import { ROLES_CONFIG, type Tab } from '@shared/config/roles';
import type { Role } from '@shared/domain/enums';

export const TAB_META: Record<Tab, { route: string; label: string; sfSymbol: string }> = {
  chat: { route: 'chat', label: 'Chat', sfSymbol: 'message.fill' },
  hq: { route: 'hq', label: 'HQ', sfSymbol: 'house.fill' },
  family: { route: 'family', label: 'Family', sfSymbol: 'person.2.fill' },
};

export function tabsForRole(role: Role) {
  return ROLES_CONFIG[role].tabs.map((tab) => ({ tab, ...TAB_META[tab] }));
}
