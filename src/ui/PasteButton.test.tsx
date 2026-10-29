// G8 UX review findings 1–2: the Paste button.
// 1. On the web the clipboard read can reject (no permission, Safari) or never settle: the button must say so
//    (onFailed → a visible line), never sit there dead. It times out after APP_TIMEOUTS.clipboardReadMs.
// 2. Size per the Login board (86×52), never under the 44pt floor; the system control gets the same frame.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { APP_TIMEOUTS } from '@shared/config/appTimeouts';
import { G8_UI_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { LinkField } from '@/features/accounts/parts';
import { PasteButton } from './PasteButton';

let mockSystem = false;
jest.mock('expo-clipboard', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    get isPasteButtonAvailable() {
      return mockSystem;
    },
    getStringAsync: jest.fn(async () => ''),
    ClipboardPasteButton: (props: { style: unknown }) => <MockView testID="system-paste" style={props.style} />,
  };
});
jest.mock('@shared/config/appTimeouts', () => ({ APP_TIMEOUTS: { ...jest.requireActual('@shared/config/appTimeouts').APP_TIMEOUTS, clipboardReadMs: 60 } }));
const getString = Clipboard.getStringAsync as jest.Mock;

beforeEach(() => {
  mockSystem = false;
  getString.mockReset();
});

test('a clipboard read that rejects calls onFailed, not onPasted', async () => {
  getString.mockRejectedValueOnce(new Error('NotAllowedError'));
  const onPasted = jest.fn();
  const onFailed = jest.fn();
  await renderWithTheme(<PasteButton label="Paste" onPasted={onPasted} onFailed={onFailed} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Paste' })));
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(onPasted).not.toHaveBeenCalled();
});

test('a clipboard read that never settles times out into onFailed', async () => {
  // Real timers (fake ones stall RNTL's async render); this file shortens APP_TIMEOUTS.clipboardReadMs.
  getString.mockImplementationOnce(() => new Promise(() => {}));
  const onFailed = jest.fn();
  await renderWithTheme(<PasteButton label="Paste" onPasted={jest.fn()} onFailed={onFailed} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Paste' })));
  await act(async () => {
    await new Promise((r) => setTimeout(r, APP_TIMEOUTS.clipboardReadMs + 50));
  });
  expect(onFailed).toHaveBeenCalledTimes(1);
});

test('our button is 86×52 (board LoginInvite), never under 44pt', async () => {
  await renderWithTheme(<PasteButton label="Paste" onPasted={jest.fn()} />);
  const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Paste' }).props.style);
  expect(style.height).toBe(52);
  expect(style.minWidth).toBeGreaterThanOrEqual(86);
});

test('the system paste control gets the same 86×52 frame', async () => {
  mockSystem = true;
  await renderWithTheme(<PasteButton label="Paste" onPasted={jest.fn()} />);
  expect(StyleSheet.flatten(screen.getByTestId('system-paste').props.style)).toMatchObject({ width: 86, height: 52 });
});

test('the schedule-link field shows a visible line when the clipboard can’t be read', async () => {
  getString.mockRejectedValueOnce(new Error('NotAllowedError'));
  await renderWithTheme(<LinkField label="Schedule link" value="" placeholder="https://…" onChange={jest.fn()} onSubmit={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: G8_UI_COPY.pasteLinkLabel })));
  expect(screen.getByText(G8_UI_COPY.pasteFailed)).toBeTruthy();
});
