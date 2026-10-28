import { type ReactNode, useContext } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTokens } from './theme';

/**
 * How the screen is shown, which decides where its safe-area padding comes from (owner, Oct 28: every screen
 * respects the safe areas; seen on an iPhone: a full-screen modal's title sat under the status bar).
 *   full   a full-screen route or fullScreenModal: the insets from the provider, top and bottom. The native
 *          SafeAreaView doesn't pick up the top inset inside an iOS fullScreenModal, so it isn't trusted here.
 *   tab    a tab's screen: top inset only (the tab bar owns the bottom).
 *   sheet  an iOS page-sheet modal (`presentation: 'modal'`): the native SafeAreaView, which pads only where
 *          the sheet actually meets an inset (a page sheet starts below the status bar, so no extra gap);
 *          on web and Android, where 'modal' is full screen, it pads like `full`.
 */
export type Presentation = 'full' | 'tab' | 'sheet';

const SIDES: Edge[] = ['left', 'right'];
const ALL: Edge[] = ['top', 'bottom', 'left', 'right'];
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** The safe-area edges the native view handles, and the padding added from the provider's insets. */
export function useSafeAreaPadding(presentation: Presentation): { edges: Edge[]; padding: ViewStyle } {
  // Expo Router always provides the insets; without a provider (a bare component test) they're zero.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  if (presentation === 'sheet') return { edges: ALL, padding: {} };
  return { edges: SIDES, padding: { paddingTop: insets.top, paddingBottom: presentation === 'full' ? insets.bottom : 0 } };
}

/** A full-bleed background in the theme's bg color with the safe-area padding for its presentation. */
export function SafeFrame({ presentation = 'full', style, children, testID }: { presentation?: Presentation; style?: StyleProp<ViewStyle>; children: ReactNode; testID?: string }) {
  const tokens = useTokens();
  const { edges, padding } = useSafeAreaPadding(presentation);
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: tokens.bg }, padding, style]} testID={testID}>
      {children}
    </SafeAreaView>
  );
}

export type ScreenProps = { children: ReactNode; scroll?: boolean; padded?: boolean; presentation?: Presentation; testID?: string };

/** The full-bleed background every screen sits on, in the theme's bg color, respecting safe areas. */
export function Screen({ children, scroll = false, padded = true, presentation = 'full', testID }: ScreenProps) {
  const tokens = useTokens();
  const Container = scroll ? ScrollView : View;
  return (
    <SafeFrame presentation={presentation} testID={testID}>
      <Container
        style={scroll ? styles.fill : [styles.fill, padded && { padding: tokens.spacing.lg }]}
        contentContainerStyle={scroll ? (padded ? { padding: tokens.spacing.lg } : undefined) : undefined}
      >
        {children}
      </Container>
    </SafeFrame>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
