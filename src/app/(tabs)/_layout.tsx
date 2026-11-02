// Web tab layout — PLAN §Platforms: "On wide web screens the tab bar becomes a left sidebar, as in the
// desktop mockups." Built on expo-router/ui's headless Tabs/TabList/TabTrigger/TabSlot (not the native
// tab bar, which can't reflow) so it can reflow between a bottom row and a sidebar; chosen by this
// file's platform extension (native uses _layout.native.tsx, which keeps NativeTabs as-is).
//
// G2 fix item 2 ("Tabs remount/reflash"): this used to be a plain `Slot`, which renders only the
// currently-matched route — switching Chat -> HQ -> Family *unmounted* the previous tab's whole screen
// tree every time (losing scroll position and local state, and re-running every loading check from
// scratch each revisit), unlike native tabs (which keep every visited tab mounted, just hidden).
// `TabSlot` is expo-router's tab-aware equivalent of `Slot` for exactly this custom-tab-bar case: per
// its docs (docs.expo.dev/router/advanced/custom-tabs, `TabSlotProps.detachInactiveScreens`, default
// false), it keeps every visited tab's screen tree mounted — hidden, not unmounted — when switching
// away, matching native tabs' own behavior.
import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui/Text';
import { useTheme, useTokens } from '@/ui/theme';
import { DemoQuickMenu } from '@/features/settings/DemoQuickMenu';
import { tabsForRole } from '@/features/shell/tabs';

import { DESKTOP_LAYOUT } from '@shared/config/theme';
import { useDesktopLayout } from '@/ui/useDesktopLayout';
import { Glyph, type GlyphName } from '@/features/integrations/glyphs';
import { router } from '@/features/shell/navigation';

const NAV_ICONS: Record<string, GlyphName> = { chat: 'chat', ideas: 'bulb', hq: 'home', family: 'people' };
const UTILITIES = [
  { label: 'Today', icon: 'sun', route: '/today' },
  { label: 'Connected accounts', icon: 'link', route: '/accounts' },
  { label: 'Settings', icon: 'settings', route: '/settings' },
] as const;

// The tabs ErrorBoundary is shared with the native layout (src/features/shell/TabErrorBoundary.tsx).
export { TabErrorBoundary as ErrorBoundary } from '@/features/shell/TabErrorBoundary';

export default function TabLayout() {
  const { role } = useTheme();
  const tokens = useTokens();
  const isWide = useDesktopLayout();
  // Tab screens leave the bottom inset to the bar (src/ui/Screen.tsx 'tab'), so the bar keeps it above the
  // home indicator (iPhone Safari).
  const insets = useSafeAreaInsets();
  const tabs = tabsForRole(role);

  return (
    // G2 BLOCKER fix (white flash): backgroundColor here (not just on Screen, per-tab) covers the frame
    // between one tab's screen hiding and the next one's showing.
    <Tabs style={{ flex: 1, flexDirection: isWide ? 'row' : 'column-reverse', backgroundColor: tokens.bg }}>
      {/* Nav *before* content in source order on purpose: with `column-reverse` (mobile) the flex box
          visually mirrors its children, so a nav-first order puts it at the bottom; `row` (wide) keeps
          source order as visual order, so the same nav-first order puts it on the *left* — "a left
          sidebar", per PLAN §Platforms. Swapping this order (as an earlier draft of this file did) put
          the tab bar at the top on mobile and the sidebar on the right on desktop. */}
      <TabList asChild>
        <View
          style={
            isWide
              ? { flexDirection: 'column', width: DESKTOP_LAYOUT.sidebarWidth, flexShrink: 0, borderRightWidth: 1, borderRightColor: tokens.line, backgroundColor: tokens.surface, padding: tokens.spacing.md, gap: tokens.spacing.xs }
              : { flexDirection: 'row', borderTopWidth: 1, borderTopColor: tokens.line, backgroundColor: tokens.surface, paddingBottom: insets.bottom }
          }
        >
          {isWide && <View style={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xl }}><Text variant="title" weight="700">MEGA</Text><Text variant="caption" color="muted">Your family, connected</Text></View>}
          {tabs.map(({ tab, route, label }) => (
            <TabTrigger key={tab} name={route} href={`/${route}` as never} asChild>
              <TabBarButton label={label} icon={NAV_ICONS[tab]} wide={isWide} />
            </TabTrigger>
          ))}
          {isWide && <View style={{ flex: 1 }} />}
          {isWide && <View style={{ borderTopWidth: 1, borderTopColor: tokens.line, paddingTop: tokens.spacing.md, gap: tokens.spacing.xs }}>
            {UTILITIES.filter(item => role !== 'kid' || item.route !== '/accounts').map(item => <Pressable key={item.route} accessibilityRole="button" onPress={() => router.push(item.route)} style={({ pressed, hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, minHeight: tokens.touchTarget, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radii.md, backgroundColor: pressed || hovered ? tokens.line : 'transparent' })}><Glyph name={item.icon} color={tokens.muted} size={20} /><Text variant="label" color="muted">{item.label}</Text></Pressable>)}
          </View>}
          {isWide && <DemoQuickMenu placement="sidebar" />}
        </View>
      </TabList>
      <TabSlot style={{ flex: 1, minWidth: 0 }} />
      {!isWide && <DemoQuickMenu placement="floating" />}
    </Tabs>
  );
}

type TabBarButtonProps = TabTriggerSlotProps & { label: string; icon?: GlyphName; wide: boolean };

/** The `asChild` target for each `TabTrigger`. `isFocused` is injected by `TabTrigger`; the rest
 * (`onPress`, `href` for a real web anchor, …) is spread straight onto `Pressable`, the same pattern the
 * Expo Router docs' own custom-tab-button example uses. `ref` is deliberately not forwarded on to
 * `Pressable` — `TabTriggerSlotProps`' `Ref<View>` (from expo-router/ui's own react-native types) and
 * this RN version's `Pressable` ref type don't line up, and nothing here needs imperative access to the
 * host node. */
function TabBarButton({ isFocused, label, icon, wide, ref: _ref, ...props }: TabBarButtonProps) {
  const tokens = useTokens();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      // G2 polish fix: a bit more than the 44pt floor on the tappable area (not the visual size) —
      // kids get the bigger hitSlop too, via ROLES_CONFIG[role].bigTargets (tokens.hitSlop).
      hitSlop={{ top: tokens.hitSlop, bottom: tokens.hitSlop, left: tokens.hitSlop, right: tokens.hitSlop }}
      style={
        wide
          ? { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, minHeight: tokens.touchTarget, borderRadius: tokens.radii.md, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md, backgroundColor: isFocused ? tokens.line : 'transparent' }
          : { flex: 1, alignItems: 'center', paddingVertical: tokens.spacing.sm, minHeight: tokens.touchTarget, justifyContent: 'center' }
      }
    >
      {wide && icon && <Glyph name={icon} color={isFocused ? tokens.accent : tokens.muted} size={20} />}
      <Text variant="label" color={isFocused ? 'accent' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}
