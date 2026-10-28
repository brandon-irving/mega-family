// Owner, Oct 28: "make sure ... i am able to close all opened modals". Every overlay has a visible ✕ of at
// least 44pt, and closes on Android back and on Escape (web); bottom sheets also close when dragged down
// (src/ui/dismiss.tsx). One test per overlay family.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { BackHandler, Platform, StyleSheet } from 'react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CATALOG, ZAP_LOOK } from '@/test/gdFixtures';
import { SAMPLE_SAVE_CHIP, TEAL_INFO } from '@/test/fixtures';
import { BottomSheet } from '@/features/signin/sheets';
import { SaveChip } from '@/features/chat/SaveChip';
import { StoreScreenView } from '@/features/store/StoreScreen';
import { TalkContent } from '@/features/talk/TalkContent';
import { SHEET_DISMISS, TOUCH_TARGET } from '@shared/config/theme';
import { BottomSheetModal } from './BottomSheetModal';
import { swipeDismisses } from './dismiss';
import { Sheet } from './Sheet';
import { Text } from './Text';

const noop = () => {};
const replaced: { restore: () => void }[] = [];
// The sign-in sheet's module imports the auth service (an ESM client Jest can't load); it isn't used here.
jest.mock('@/services/auth', () => ({ appleSignInOffIos: () => false, signOut: jest.fn() }));
jest.mock('@/services/AppleSignInButton', () => ({ AppleSignInButton: () => null }));

function expectBigEnough(el: { props: { style?: unknown } }) {
  const s = StyleSheet.flatten(el.props.style as never) as { width?: number; height?: number };
  expect(s.width).toBeGreaterThanOrEqual(TOUCH_TARGET.normal);
  expect(s.height).toBeGreaterThanOrEqual(TOUCH_TARGET.normal);
}

// The page's key events, faked (src/ui/webKeys.ts): a test presses Escape through these listeners.
const mockKeyListeners: ((e: { key: string }) => void)[] = [];
jest.mock('./webKeys', () => ({
  webKeyTarget: () => ({
    addEventListener: (_t: string, f: (e: { key: string }) => void) => mockKeyListeners.push(f),
    removeEventListener: (_t: string, f: (e: { key: string }) => void) => {
      const i = mockKeyListeners.indexOf(f);
      if (i >= 0) mockKeyListeners.splice(i, 1);
    },
  }),
}));

/** Pretend to be the web, so a test can press Escape. */
function asWeb() {
  replaced.push(jest.replaceProperty(Platform, 'OS', 'web'));
  return { escape: () => mockKeyListeners.slice().forEach((f) => f({ key: 'Escape' })) };
}

afterEach(() => {
  jest.restoreAllMocks();
  // Jest 30's restoreAllMocks leaves replaced properties alone; put Platform.OS back by hand.
  replaced.splice(0).forEach((r) => r.restore());
});

describe('every modal can be closed', () => {
  test('a drag closes a sheet only when it went far enough down or was flicked down', () => {
    expect(swipeDismisses({ dy: SHEET_DISMISS.swipeDistance + 1, vy: 0 })).toBe(true);
    expect(swipeDismisses({ dy: 20, vy: SHEET_DISMISS.swipeVelocity + 0.1 })).toBe(true);
    expect(swipeDismisses({ dy: 20, vy: 0.1 })).toBe(false);
    expect(swipeDismisses({ dy: -200, vy: -2 })).toBe(false);
  });

  test('BottomSheetModal: ✕, scrim and Escape close it; the panel takes drags', async () => {
    const web = asWeb();
    const onClose = jest.fn();
    await renderWithTheme(
      <BottomSheetModal open onClose={onClose} label="Change scope">
        <Text>Body</Text>
      </BottomSheetModal>,
    );
    const close = screen.getByTestId('modal-close');
    expectBigEnough(close);
    await fireEvent.press(close);
    await fireEvent.press(screen.getByTestId('modal-scrim'));
    await act(() => web.escape());
    expect(onClose).toHaveBeenCalledTimes(3);
    // The swipe-down responder is on the panel (its decision is tested above).
    expect(typeof screen.getByTestId('modal-panel').props.onMoveShouldSetResponder).toBe('function');
  });

  test('the sign-in sheet (inline, over the walkers): ✕ and Escape close it', async () => {
    const web = asWeb();
    const onClose = jest.fn();
    await renderWithTheme(
      <BottomSheet open onClose={onClose} label="Sign in">
        <Text>Body</Text>
      </BottomSheet>,
    );
    const close = screen.getByTestId('sheet-close');
    expectBigEnough(close);
    await fireEvent.press(close);
    await act(() => web.escape());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('Android back closes the sign-in sheet', async () => {
    replaced.push(jest.replaceProperty(Platform, 'OS', 'android'));
    let handler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handler = h as () => boolean;
      return { remove: noop };
    });
    const onClose = jest.fn();
    await renderWithTheme(
      <BottomSheet open onClose={onClose} label="Sign in">
        <Text>Body</Text>
      </BottomSheet>,
    );
    expect(handler?.()).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  test('a route Sheet (Today, profile, settings…): ✕ and Escape close it', async () => {
    const web = asWeb();
    const onClose = jest.fn();
    await renderWithTheme(
      <Sheet title="Today" onClose={onClose}>
        <Text>Row</Text>
      </Sheet>,
    );
    await fireEvent.press(screen.getByLabelText('Close'));
    await act(() => web.escape());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('the Store’s buy sheet has a ✕ that closes it', async () => {
    await renderWithTheme(<StoreScreenView megaName="Zap" balance={20} items={CATALOG} look={ZAP_LOOK} initialTab="antennas" onClose={noop} onBuy={async () => true} onWear={noop} onDecorate={noop} />, { role: 'kid' });
    await fireEvent.press(screen.getByText('Buy for 12'));
    expect(await screen.findByText('Buy Star antenna?')).toBeTruthy();
    const close = screen.getByTestId('modal-close');
    expectBigEnough(close);
    await fireEvent.press(close);
    expect(screen.queryByText('Buy Star antenna?')).toBeNull();
  });

  test('the saved-memory scope sheet has a ✕ that closes it', async () => {
    await renderWithTheme(<SaveChip chip={SAMPLE_SAVE_CHIP} onChangeScope={noop} onForget={noop} />);
    await fireEvent.press(screen.getByLabelText(/Tap to change/));
    expect(screen.getByText('Change scope')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('modal-close'));
    expect(screen.queryByText('Change scope')).toBeNull();
  });

  test('talk mode’s ✕ is at least 44pt and Escape closes it', async () => {
    const web = asWeb();
    const onClose = jest.fn();
    await renderWithTheme(
      <TalkContent mega={TEAL_INFO} phase="idle" caption="" mentions={[]} reply="" error={null} onHoldStart={noop} onSlideLock={noop} onRelease={noop} onRemoveMention={noop} onSend={noop} onClose={onClose} />,
    );
    const close = screen.getByLabelText('Close talk mode');
    expectBigEnough(close);
    await fireEvent.press(close);
    await act(() => web.escape());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
