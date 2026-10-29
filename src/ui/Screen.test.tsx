// Seen on the owner's iPhone (Oct 28): the signed-in-without-family screen (onboarding, a fullScreenModal)
// drew its title under the status bar — the native SafeAreaView didn't apply the top inset there. Screens
// shown full screen take the insets from the provider; tab screens take the top only; page sheets keep the
// native view (which pads only where the sheet meets an inset).
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LAYOUT } from '@shared/config/theme';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Screen } from './Screen';
import { Text } from './Text';

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

async function frame(presentation?: 'full' | 'tab' | 'sheet') {
  const view = await renderWithTheme(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Screen presentation={presentation} testID="screen">
        <Text>Welcome to MEGA</Text>
      </Screen>
    </SafeAreaProvider>,
  );
  const node = view.getByTestId('screen');
  const style = StyleSheet.flatten(node.props.style) as { paddingTop?: number; paddingBottom?: number };
  return { style, edges: (node.props.edges ?? {}) as Record<string, string> };
}

describe('Screen safe areas', () => {
  test('a full-screen route (or fullScreenModal) pads by the top and bottom insets itself', async () => {
    const { style } = await frame();
    expect(style.paddingTop).toBe(59);
    expect(style.paddingBottom).toBe(34);
  });

  test('a tab screen pads the top only (the tab bar owns the bottom)', async () => {
    const { style } = await frame('tab');
    expect(style.paddingTop).toBe(59);
    expect(style.paddingBottom ?? 0).toBe(0);
  });

  test('a page-sheet modal leaves the insets to the native view on every edge', async () => {
    const { style, edges } = await frame('sheet');
    expect(style.paddingTop ?? 0).toBe(0);
    expect(edges.top).toBeTruthy();
    expect(edges.bottom).toBeTruthy();
  });
});

// G6 walkthrough fix (P1): desktop web ran content edge-to-edge (the chat column hit ~1140px at 1440px
// wide; same dead-space-beside-content pattern on the Invite/QR sheet and HQ room). One token
// (tokens.layout.contentMaxWidth), applied once here, caps every Screen's content width and centers it —
// Jest has no real layout engine (see the comment above), so this checks the *style rule* itself: `width:
// '100%'` is what makes a narrow phone unaffected (it never fills less than all of a parent narrower than
// the cap), and `maxWidth` is what caps it once the parent's wider. Both hold regardless of the device's
// actual width, because the component never branches on `useWindowDimensions` for this — the layout engine
// (real on device, absent in Jest) resolves the same style differently at each width.
describe('Screen content width (G6 polish)', () => {
  async function contentStyle(frameWidth: number) {
    const view = await renderWithTheme(
      <SafeAreaProvider initialMetrics={{ ...METRICS, frame: { ...METRICS.frame, width: frameWidth } }}>
        <Screen testID="screen">
          <Text>Welcome to MEGA</Text>
        </Screen>
      </SafeAreaProvider>,
    );
    const content = view.getByTestId('screen-content');
    return StyleSheet.flatten(content.props.style) as { width?: string; maxWidth?: number };
  }

  test('a narrow (phone) frame: the content style still fills 100% — no fixed-width shrink', async () => {
    const style = await contentStyle(390);
    expect(style.width).toBe('100%');
    expect(style.maxWidth).toBe(LAYOUT.contentMaxWidth);
  });

  test('a wide (desktop) frame: the same style caps at tokens.layout.contentMaxWidth', async () => {
    const style = await contentStyle(1440);
    expect(style.width).toBe('100%');
    expect(style.maxWidth).toBe(LAYOUT.contentMaxWidth);
  });

  // G6 review fix: the cap had no opt-out, so the homework live camera (HomeworkSnap) was squeezed to
  // 720px on wide desktop web instead of filling the frame. `fullBleed` skips the cap entirely.
  test('fullBleed skips the cap, even at a wide (desktop) frame', async () => {
    const view = await renderWithTheme(
      <SafeAreaProvider initialMetrics={{ ...METRICS, frame: { ...METRICS.frame, width: 1440 } }}>
        <Screen testID="screen" fullBleed>
          <Text>Live camera</Text>
        </Screen>
      </SafeAreaProvider>,
    );
    const content = view.getByTestId('screen-content');
    const style = StyleSheet.flatten(content.props.style) as { maxWidth?: number };
    expect(style.maxWidth).toBeUndefined();
  });
});
