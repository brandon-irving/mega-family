// Web tab layout — PLAN §Platforms: "On wide web screens the tab bar becomes a left sidebar, as in
// the desktop mockups." Built with Slot (not the native tab bar) so it can reflow between a bottom
// row and a sidebar; chosen by this file's platform extension (native uses _layout.native.tsx).
import { Link, Slot, usePathname } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme, useTokens } from '@/ui/theme';
import { tabsForRole } from '@/features/shell/tabs';

const WIDE_BREAKPOINT = 768;

export default function TabLayout() {
  const { role } = useTheme();
  const tokens = useTokens();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const tabs = tabsForRole(role);

  const nav = (
    <View
      style={
        isWide
          ? { width: 220, borderRightWidth: 1, borderRightColor: tokens.line, paddingTop: tokens.spacing.xl, gap: tokens.spacing.xs }
          : { flexDirection: 'row', borderTopWidth: 1, borderTopColor: tokens.line, backgroundColor: tokens.surface }
      }
    >
      {tabs.map(({ tab, route, label }) => {
        const active = pathname === `/${route}` || pathname.startsWith(`/${route}/`);
        return (
          <Link key={tab} href={`/${route}` as never} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              style={
                isWide
                  ? { paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg, backgroundColor: active ? tokens.surface : 'transparent' }
                  : { flex: 1, alignItems: 'center', paddingVertical: tokens.spacing.sm, minHeight: tokens.touchTarget, justifyContent: 'center' }
              }
            >
              <Text variant="label" color={active ? 'accent' : 'muted'}>
                {label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: isWide ? 'row' : 'column-reverse', backgroundColor: tokens.bg }}>
      {nav}
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}
