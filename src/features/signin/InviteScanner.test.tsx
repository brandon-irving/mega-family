// G8 (CONTRACT v0.18, docs/gates/G8.md invariants 5 and 6; boards LoginScan, ScanDenied, ScanNotInvite,
// ScanFound): the in-app QR scanner. expo-camera is mocked — the CameraView stand-in records its props so
// a test can "scan" by calling onBarcodeScanned, and the permission hook is driven per test.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';
import { G8_COPY, G8_UI_COPY } from '@shared/config/copy';
import { INVITE_SCAN } from '@shared/config/auth';
import { inviteTokenFromScan } from '@shared/inviteToken';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SCAN_BAD, SCAN_GOOD, SCAN_TOKEN } from '@/test/g8Fixtures';
import { router } from 'expo-router';
import ScanRoute from '@/app/scan';

type Perm = { granted: boolean; canAskAgain: boolean; status: string } | null;
let mockPermission: Perm = { granted: true, canAskAgain: true, status: 'granted' };
const mockRequest = jest.fn(async () => mockPermission);
let mockCameraProps: { onBarcodeScanned?: (r: { data: string; type: string }) => void; barcodeScannerSettings?: { barcodeTypes: string[] } } = {};

jest.mock('expo-camera', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    useCameraPermissions: () => [mockPermission, mockRequest, mockRequest],
    CameraView: (props: Record<string, unknown>) => {
      mockCameraProps = props as typeof mockCameraProps;
      return <MockView testID="camera" />;
    },
  };
});

jest.mock('@/services/auth', () => ({ signOut: jest.fn(), useSignedInEmail: () => null }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
  Redirect: () => null,
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

const R = router as unknown as Record<'push' | 'replace' | 'back' | 'dismissAll', jest.Mock>;
/** The route's handlers, observed through the mocked router. */
const h = {
  get onToken() {
    return R.replace;
  },
  get onPasteInstead() {
    return R.back;
  },
  get onClose() {
    return R.back;
  },
  get onNotNow() {
    return R.dismissAll;
  },
};
const scan = (data: string) =>
  act(async () => {
    mockCameraProps.onBarcodeScanned?.({ data, type: 'qr' });
  });

beforeEach(() => {
  mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
  mockRequest.mockClear();
  mockCameraProps = {};
  Object.values(R).forEach((fn) => fn.mockClear());
});

describe('inviteTokenFromScan (strict: only MEGA invites)', () => {
  test.each(SCAN_GOOD)('accepts %s', (input) => {
    expect(inviteTokenFromScan(input)).toBe(SCAN_TOKEN);
  });
  test.each(SCAN_BAD)('refuses %j', (input) => {
    expect(inviteTokenFromScan(input)).toBeNull();
  });
});

describe('InviteScanner', () => {
  test('live: the camera scans QR codes only, with the hint and "Paste a link instead"', async () => {
        await renderScreen(<ScanRoute />);
    expect(screen.getByTestId('camera')).toBeTruthy();
    expect(mockCameraProps.barcodeScannerSettings?.barcodeTypes).toEqual([...INVITE_SCAN.barcodeTypes]);
    expect(screen.getByText(G8_COPY.scanHint)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: G8_COPY.scanPasteInstead })));
    expect(h.onPasteInstead).toHaveBeenCalledTimes(1);
  });

  test.each(SCAN_GOOD)('a good read (%s) says "Found it" and opens that invite', async (input) => {
        await renderScreen(<ScanRoute />);
    await scan(input);
    expect(screen.getByText(G8_COPY.scanFound)).toBeTruthy();
    expect(h.onToken).toHaveBeenCalledWith(`/join/${SCAN_TOKEN}`);
  });

  test.each(SCAN_BAD)('a bad read (%j) says it isn’t an invite and goes nowhere', async (input) => {
        const open = jest.spyOn(Linking, 'openURL');
    await renderScreen(<ScanRoute />);
    await scan(input);
    expect(screen.getByText(G8_COPY.scanNotInvite)).toBeTruthy();
    expect(h.onToken).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  test('a burst of good reads inside the cooldown opens the invite exactly once', async () => {
        await renderScreen(<ScanRoute />);
    await scan(SCAN_GOOD[0]);
    await scan(SCAN_GOOD[0]);
    await scan(SCAN_GOOD[2]);
    expect(h.onToken).toHaveBeenCalledTimes(1);
  });

  test('denied: honest copy, Open Settings / Paste a link instead / Not now, and no camera', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
        const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderScreen(<ScanRoute />);
    expect(screen.queryByTestId('camera')).toBeNull();
    expect(screen.getByText(G8_COPY.scanDenied)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: G8_COPY.scanOpenSettings })));
    expect(settings).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: G8_COPY.scanPasteInstead })));
    expect(h.onPasteInstead).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: G8_UI_COPY.scanNotNow })));
    expect(h.onNotNow).toHaveBeenCalledTimes(1);
    settings.mockRestore();
  });

  test('not asked yet: asks once on open (the person tapped Scan), no blank camera meanwhile', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    await renderScreen(<ScanRoute />);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('camera')).toBeNull();
  });

  test('the close button closes the scanner', async () => {
        await renderScreen(<ScanRoute />);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: G8_UI_COPY.scanClose })));
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
