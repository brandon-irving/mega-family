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
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme, useTokens } from '@/ui/theme';
import { tabsForRole } from '@/features/shell/tabs';

const WIDE_BREAKPOINT = 768;

export default function TabLayout() {
  const { role } = useTheme();
  const tokens = useTokens();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
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
              ? { width: 220, borderRightWidth: 1, borderRightColor: tokens.line, paddingTop: tokens.spacing.xl, gap: tokens.spacing.xs }
              : { flexDirection: 'row', borderTopWidth: 1, borderTopColor: tokens.line, backgroundColor: tokens.surface }
          }
        >
          {tabs.map(({ tab, route, label }) => (
            <TabTrigger key={tab} name={route} href={`/${route}` as never} asChild>
              <TabBarButton label={label} wide={isWide} />
            </TabTrigger>
          ))}
        </View>
      </TabList>
      <TabSlot style={{ flex: 1 }} />
    </Tabs>
  );
}

type TabBarButtonProps = TabTriggerSlotProps & { label: string; wide: boolean };

/** The `asChild` target for each `TabTrigger`. `isFocused` is injected by `TabTrigger`; the rest
 * (`onPress`, `href` for a real web anchor, …) is spread straight onto `Pressable`, the same pattern the
 * Expo Router docs' own custom-tab-button example uses. `ref` is deliberately not forwarded on to
 * `Pressable` — `TabTriggerSlotProps`' `Ref<View>` (from expo-router/ui's own react-native types) and
 * this RN version's `Pressable` ref type don't line up, and nothing here needs imperative access to the
 * host node. */
function TabBarButton({ isFocused, label, wide, ref: _ref, ...props }: TabBarButtonProps) {
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
          ? { paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg, backgroundColor: isFocused ? tokens.surface : 'transparent' }
          : { flex: 1, alignItems: 'center', paddingVertical: tokens.spacing.sm, minHeight: tokens.touchTarget, justifyContent: 'center' }
      }
    >
      <Text variant="label" color={isFocused ? 'accent' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}
