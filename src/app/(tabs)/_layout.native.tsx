// Native tab bar (iOS/Android) — PLAN §Platforms. Tabs come from ROLES_CONFIG[role].tabs: kid sees
// Chat · HQ, adult/admin see Chat · Ideas · HQ · Family.
import { View } from 'react-native';
import { DemoQuickMenu } from '@/features/settings/DemoQuickMenu';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/ui/theme';
import { tabsForRole } from '@/features/shell/tabs';

export { TabErrorBoundary as ErrorBoundary } from '@/features/shell/TabErrorBoundary';

export default function TabLayout() {
  const { role } = useTheme();
  const tabs = tabsForRole(role);

  return (
    <View style={{ flex: 1 }}>
    <NativeTabs>
      {tabs.map(({ tab, route, label, sfSymbol, manualInsets }) => (
        <NativeTabs.Trigger key={tab} name={route} disableAutomaticContentInsets={manualInsets}>
          <NativeTabs.Trigger.Label>{label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={sfSymbol as never} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
    <DemoQuickMenu placement="floating" />
    </View>
  );
}
