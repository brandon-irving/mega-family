// Seen on the owner's iPhone (Oct 28): the signed-in-without-family screen (onboarding, a fullScreenModal)
// drew its title under the status bar — the native SafeAreaView didn't apply the top inset there. Screens
// shown full screen take the insets from the provider; tab screens take the top only; page sheets keep the
// native view (which pads only where the sheet meets an inset).
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
