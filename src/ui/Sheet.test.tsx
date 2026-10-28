// Owner, Oct 28: every screen and modal respects the safe areas, and every modal can be closed. The Sheet
// (Today, MEGA profile, Settings, member detail, calendar, lists…) keeps its header below the status bar /
// notch and its last row above the home indicator, and always has a ≥44pt Close button.
import { fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TOUCH_TARGET } from '@shared/config/theme';
import { Sheet } from './Sheet';
import { Text } from './Text';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

describe('Sheet', () => {
  test('keeps the header below the top inset and the content above the bottom inset', async () => {
    const view = await renderWithTheme(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Sheet title="Today" onClose={() => {}}>
          <Text>Row</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    // The native SafeAreaView pads where it meets the insets (Jest has no native layout, so check its edges).
    // (The native view receives edges as a map, e.g. { top: 'additive' }.)
    const edges: Record<string, string> = view.getByTestId('sheet').props.edges ?? {};
    expect(edges.top).toBeTruthy();
    expect(edges.bottom).toBeTruthy();
  });

  test('has a Close button at least 44pt that closes', async () => {
    const onClose = jest.fn();
    const view = await renderWithTheme(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Sheet title="Today" onClose={onClose}>
          <Text>Row</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    const close = view.getByLabelText('Close');
    const s = StyleSheet.flatten(close.props.style) as { width?: number; height?: number };
    expect(s.width).toBeGreaterThanOrEqual(TOUCH_TARGET.normal);
    expect(s.height).toBeGreaterThanOrEqual(TOUCH_TARGET.normal);
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });
});
