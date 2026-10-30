// G8: mega://widgets was a G1 placeholder ("arrive in a later milestone"). Now the widgets exist, so the
// sheet says how to add them (iPhone) or where they live (web), and closes like every sheet.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { G8_UI_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import WidgetsRoute from '@/app/widgets';

jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn() } }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderSheet = () => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}><WidgetsRoute /></SafeAreaProvider>);

test('on the phone: how to add the home- and lock-screen widgets; no "later milestone" placeholder', async () => {
  await renderSheet();
  expect(screen.getByText(G8_UI_COPY.widgetsSheetBody)).toBeTruthy();
  expect(screen.queryByText(/later milestone/)).toBeNull();
});

test('on the web: where the widgets live', async () => {
  const restore = jest.replaceProperty(Platform, 'OS', 'web');
  await renderSheet();
  expect(screen.getByText(G8_UI_COPY.widgetsSheetWeb)).toBeTruthy();
  restore.restore();
});

test('closes', async () => {
  await renderSheet();
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: /close/i })[0]));
  expect(router.back).toHaveBeenCalled();
});
