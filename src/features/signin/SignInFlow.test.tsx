// The sign-in flow states after Welcome (Screen 9 boards LoginInvite, LoginPreview, LoginLocked,
// LoginFamily, LoginOpening). Convex, auth and the router are mocked: this tests what each screen shows and
// where each tap goes.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { ConvexError } from 'convex/values';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';
import { router } from 'expo-router';
import { renderWithTheme } from '@/test/renderWithTheme';
import InviteRoute from '@/app/invite';
import JoinRoute from '@/app/join/[token]';
import StartRoute from '@/app/start';
import { signOut } from '@/services/auth';
import { OpeningScreen } from './OpeningScreen';
import { extractToken } from './inviteToken';

const mockRedeem = jest.fn();
jest.mock('convex/react', () => ({ useAction: () => mockRedeem }));
jest.mock('@/services/auth', () => ({ signOut: jest.fn(), useSignedInEmail: () => 'parent@example.com' }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({ token: 'TOKEN123' }),
}));

// The walking MEGAs run on a timer (tested on their own in walkers/engine.test.ts and Welcome.test.tsx);
// here they'd only add timer-driven re-renders between the flow's own act() calls, so the stage is a
// pass-through that still renders every ledge's children.
jest.mock('@/features/walkers', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const noop = () => {};
  return {
    WalkerStage: ({ children, testID }: { children: unknown; testID?: string }) => <MockView testID={testID}>{children}</MockView>,
    Ledge: ({ children, style }: { children?: unknown; style?: unknown }) => (
      <MockView style={style}>{typeof children === 'function' ? children({ poked: false, lookHere: noop }) : children}</MockView>
    ),
    useLedge: () => ({ ref: { current: null }, onLayout: noop, dipped: false, poked: false, lookHere: noop }),
    ...jest.requireActual('@/features/walkers/engine'),
  };
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderScreen = (ui: ReactElement) => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

afterEach(() => {
  jest.clearAllMocks();
  mockRedeem.mockReset();
});

describe('invite link', () => {
  test('extracts the token from a link or takes a bare code', () => {
    expect(extractToken('https://mega.family/join/7QK2-M4XD')).toBe('7QK2-M4XD');
    expect(extractToken('mega://join/abc123 ')).toBe('abc123');
    expect(extractToken(' 7QK2-M4XD ')).toBe('7QK2-M4XD');
  });

  test('Continue stays disabled until there is a link, then opens join/<token>', async () => {
    await renderScreen(<InviteRoute />);
    expect(screen.getByText('I have an invite')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Continue')));
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Invite link'), 'https://mega.family/join/7QK2-M4XD'));
    await act(async () => fireEvent.press(screen.getByText('Continue')));
    expect(router.push).toHaveBeenCalledWith('/join/7QK2-M4XD');
  });

  test('Back with nowhere to go back to signs the anonymous session out (back to Welcome)', async () => {
    await renderScreen(<InviteRoute />);
    await act(async () => fireEvent.press(screen.getByLabelText('Back')));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('join', () => {
  test('shows the invite card; the parent code only takes 5 digits; joining goes to chat', async () => {
    mockRedeem.mockResolvedValueOnce({ memberId: 'm1' });
    await renderScreen(<JoinRoute />);
    expect(screen.getByRole('header', { name: 'Join the family' })).toBeTruthy();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Parent code'), '12a3456'));
    await act(async () => fireEvent.press(screen.getByLabelText('Join the family')));
    expect(mockRedeem).toHaveBeenCalledWith({ token: 'TOKEN123', parentCode: '12345' });
    expect(router.replace).toHaveBeenCalledWith('/chat');
  });

  test('a wrong parent code shows the friendly line and stays on the screen', async () => {
    mockRedeem.mockRejectedValueOnce(new ConvexError({ code: 'WRONG_PARENT_CODE' }));
    await renderScreen(<JoinRoute />);
    await act(async () => fireEvent.press(screen.getByLabelText('Join the family')));
    expect(screen.getByText("That parent code didn't match.")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('five wrong codes (RATE_LIMITED) lock the invite; "Use a new invite" goes back to the invite screen', async () => {
    mockRedeem.mockRejectedValueOnce(new ConvexError({ code: 'RATE_LIMITED' }));
    await renderScreen(<JoinRoute />);
    await act(async () => fireEvent.press(screen.getByLabelText('Join the family')));
    expect(screen.getByText('This invite is locked')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Use a new invite')));
    expect(router.replace).toHaveBeenCalledWith('/invite');
  });
});

describe('join or start a family', () => {
  test('shows both choices and the signed-in email; each card goes where it says', async () => {
    await renderScreen(<StartRoute />);
    expect(screen.getByText('Let’s set up your family')).toBeTruthy();
    expect(screen.getByText('parent@example.com')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('Start a family')));
    expect(router.push).toHaveBeenCalledWith('/onboarding');
    await act(async () => fireEvent.press(screen.getByLabelText('Join a family')));
    expect(router.push).toHaveBeenCalledWith('/invite');
    await act(async () => fireEvent.press(screen.getByLabelText('Use a different account')));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('opening (returning user)', () => {
  test('a fast load shows only the background (no MEGAs, no spinner, no label)', async () => {
    await renderScreen(<OpeningScreen />);
    expect(screen.getByTestId('opening')).toBeTruthy();
    expect(screen.queryByTestId('opening-walkers')).toBeNull();
    expect(screen.queryByText(/Loading/)).toBeNull();
  });

  test('past ~300ms the MEGAs walk in', async () => {
    await renderScreen(<OpeningScreen />);
    expect(screen.queryByTestId('opening-walkers')).toBeNull();
    expect(await screen.findByTestId('opening-walkers', {}, { timeout: 1000 })).toBeTruthy();
  });
});
