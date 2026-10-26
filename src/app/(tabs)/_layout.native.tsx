// Native tab bar (iOS/Android) — PLAN §Platforms. Tabs come from ROLES_CONFIG[role].tabs: kid sees
// Chat · HQ, adult/admin see Chat · HQ · Family.
import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/ui/theme';
import { tabsForRole } from '@/features/shell/tabs';

export default function TabLayout() {
  const { role } = useTheme();
  const tabs = tabsForRole(role);

  return (
    <NativeTabs>
      {tabs.map(({ tab, route, label, sfSymbol }) => (
        <NativeTabs.Trigger key={tab} name={route}>
          <NativeTabs.Trigger.Label>{label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={sfSymbol as never} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
