// G8 (CONTRACT v0.18, G8.md invariant 8 and decision 6; boards LoginInvite, PasteNothing, PasteNotInvite):
// the invite screen's "Scan QR code" card (native only; the web keeps the "No link yet?" help card) and the
// Paste button in the field. The clipboard is read only inside a Paste press — never on mount or focus.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { G8_COPY, G8_UI_COPY, SIGNIN_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SCAN_TOKEN } from '@/test/g8Fixtures';
import InviteRoute from '@/app/invite';
import { pastedInvite } from './inviteToken';

let mockPasteButton = false;
let mockPasteButtonOnPress: ((p: { type: 'text'; text: string }) => void) | undefined;
jest.mock('expo-clipboard', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    get isPasteButtonAvailable() {
      return mockPasteButton;
    },
    getStringAsync: jest.fn(async () => ''),
    ClipboardPasteButton: (props: { onPress: (p: { type: 'text'; text: string }) => void }) => {
      mockPasteButtonOnPress = props.onPress;
      return <MockView testID="system-paste" />;
    },
  };
});
jest.mock('@/services/auth', () => ({ signOut: jest.fn(), useSignedInEmail: () => null }));
jest.mock('expo-router', () => ({ useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/features/walkers', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const noop = () => {};
  return {
    WalkerStage: ({ children, testID }: { children: unknown; testID?: string }) => <MockView testID={testID}>{children}</MockView>,
    Ledge: ({ children, style }: { children?: unknown; style?: unknown }) => (
      <MockView style={style}>{typeof children === 'function' ? children({ poked: false, lookHere: noop }) : children}</MockView>
    ),
    ...jest.requireActual('@/features/walkers/engine'),
  };
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderScreen = (ui: ReactElement) => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
const getString = Clipboard.getStringAsync as jest.Mock;
const press = (el: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(el);
  });

beforeEach(() => {
  mockPasteButton = false;
  mockPasteButtonOnPress = undefined;
  getString.mockReset();
  getString.mockResolvedValue('');
  (router.push as jest.Mock).mockClear();
});

describe('pastedInvite', () => {
  test.each([
    ['', 'nothing'],
    ['   ', 'nothing'],
    [`mega://join/${SCAN_TOKEN}`, 'invite'],
    ['https://mega.family/join/7QK2-M4XD', 'invite'],
    ['7QK2-M4XD', 'invite'],
    ['https://example.com/phish', 'notInvite'],
    ['call me maybe', 'notInvite'],
    ['mega://chat', 'notInvite'],
  ])('%j → %s', (text, kind) => {
    expect(pastedInvite(text).kind).toBe(kind);
  });
});

describe('Scan QR code card', () => {
  test('on the phone: the Scan card (title and hint) fills the middle and opens the scanner', async () => {
    await renderScreen(<InviteRoute />);
    expect(screen.getByText(G8_COPY.scanCardHint)).toBeTruthy();
    expect(screen.getByText(G8_UI_COPY.orScan)).toBeTruthy();
    expect(screen.queryByText(SIGNIN_COPY.invite.helpTitle)).toBeNull();
    await press(screen.getByRole('button', { name: G8_COPY.scanCard }));
    expect(router.push).toHaveBeenCalledWith('/scan');
  });

  test('on the web: no scan (native only); the "No link yet?" help card stays', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web');
    await renderScreen(<InviteRoute />);
    expect(screen.queryByText(G8_COPY.scanCard)).toBeNull();
    expect(screen.getByText(SIGNIN_COPY.invite.helpTitle)).toBeTruthy();
    restore.restore();
  });
});

describe('Paste (our button, when the system paste button is unavailable)', () => {
  test('the clipboard is never read on mount or focus', async () => {
    await renderScreen(<InviteRoute />);
    await act(async () => fireEvent(screen.getByLabelText(SIGNIN_COPY.invite.label), 'focus'));
    expect(getString).not.toHaveBeenCalled();
  });

  test('nothing copied: the gold "nothing to paste" line replaces the example', async () => {
    await renderScreen(<InviteRoute />);
    await press(screen.getByRole('button', { name: G8_UI_COPY.pasteLabel }));
    expect(getString).toHaveBeenCalledTimes(1);
    expect(screen.getByText(G8_COPY.pasteNothing)).toBeTruthy();
    expect(screen.queryByText(SIGNIN_COPY.invite.example)).toBeNull();
  });

  test('not an invite: says so, marks the field invalid and keeps what was typed', async () => {
    getString.mockResolvedValue('https://example.com/phish');
    await renderScreen(<InviteRoute />);
    await act(async () => fireEvent.changeText(screen.getByLabelText(SIGNIN_COPY.invite.label), '7QK2'));
    await press(screen.getByRole('button', { name: G8_UI_COPY.pasteLabel }));
    expect(screen.getByText(G8_COPY.pasteNotInvite)).toBeTruthy();
    const field = screen.getByLabelText(SIGNIN_COPY.invite.label);
    expect(field.props.value).toBe('7QK2');
    expect(field.props['aria-invalid']).toBe(true);
  });

  test('an invite: fills the field and Continue opens it', async () => {
    getString.mockResolvedValue(`mega://join/${SCAN_TOKEN}`);
    await renderScreen(<InviteRoute />);
    await press(screen.getByRole('button', { name: G8_UI_COPY.pasteLabel }));
    expect(screen.getByLabelText(SIGNIN_COPY.invite.label).props.value).toBe(`mega://join/${SCAN_TOKEN}`);
    await press(screen.getByText(SIGNIN_COPY.invite.cont));
    expect(router.push).toHaveBeenCalledWith(`/join/${SCAN_TOKEN}`);
  });
});

describe('Paste (the system paste button, iOS 16+)', () => {
  test('uses ClipboardPasteButton (no paste prompt) and fills the field from its text', async () => {
    mockPasteButton = true;
    await renderScreen(<InviteRoute />);
    expect(screen.getByTestId('system-paste')).toBeTruthy();
    expect(screen.queryByRole('button', { name: G8_UI_COPY.pasteLabel })).toBeNull();
    await act(async () => mockPasteButtonOnPress?.({ type: 'text', text: `mega://join/${SCAN_TOKEN}` }));
    expect(screen.getByLabelText(SIGNIN_COPY.invite.label).props.value).toBe(`mega://join/${SCAN_TOKEN}`);
    expect(getString).not.toHaveBeenCalled();
  });
});
