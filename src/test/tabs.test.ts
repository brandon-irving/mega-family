// Role-based tab config (ROLES_CONFIG, config/roles.ts) drives both the native and web tab layouts.
import { ROLES_CONFIG } from '@shared/config/roles';
import { tabsForRole } from '@/features/shell/tabs';

describe('tabsForRole', () => {
  test('kid sees Chat · HQ', () => {
    expect(tabsForRole('kid').map((t) => t.tab)).toEqual(['chat', 'hq']);
  });

  test('adult and admin see Chat · HQ · Family', () => {
    expect(tabsForRole('adult').map((t) => t.tab)).toEqual(['chat', 'hq', 'family']);
    expect(tabsForRole('admin').map((t) => t.tab)).toEqual(['chat', 'hq', 'family']);
  });

  test('matches ROLES_CONFIG exactly for every role', () => {
    for (const role of Object.keys(ROLES_CONFIG) as (keyof typeof ROLES_CONFIG)[]) {
      expect(tabsForRole(role).map((t) => t.tab)).toEqual([...ROLES_CONFIG[role].tabs]);
    }
  });
});
