// The sign-in flow states after Welcome (Screen 9 boards, canvas v33: LoginInvite / LoginInviteHelp,
// LoginPreview (adult), LoginPreviewKid, LoginExpired, LoginLocked, LoginFamily). Convex, auth and the router
// are mocked: this tests what each screen shows and where each tap goes.
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
import type { InvitePreview } from '@shared/domain/api';
import { extractToken } from './inviteToken';

const mockRedeem = jest.fn();
let mockPreview: InvitePreview | undefined;
const mockBegin = jest.fn((_args: { timezone: string }) => Promise.resolve({ familyId: 'f', threadId: 't' }));
jest.mock('@/data/useDemoProfile', () => ({ useDemoProfile: () => ({ profile: null }) }));
jest.mock('@/data/useViewer', () => ({ useViewer: () => null }));
jest.mock('convex/react', () => ({ useAction: () => mockRedeem, useMutation: () => mockBegin }));
jest.mock('@/data/useInvite', () => ({ useInvitePreview: () => mockPreview }));
jest.mock('@/services/auth', () => ({ signOut: jest.fn(), useSignedInEmail: () => 'parent@example.com' }));
jest.mock('expo-router', () => ({ useIsFocused: () => true,
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
    Obstacle: ({ children }: { children?: unknown }) => <MockView>{children}</MockView>,
    Lane: () => <MockView />,
    MegaLoader: ({ text }: { text: string }) => {
      const { Text: MockText } = jest.requireActual('react-native');
      return <MockText>{text}</MockText>;
    },
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

const FAMILY = [
  { name: 'Admin', hex: '#2FB8B0', sticker: 'star' as const },
  { name: 'Twin 1', hex: '#8E6CE0', sticker: 'bolt' as const },
];
const ADULT: InvitePreview = { status: 'ok', kind: 'adult', inviterName: 'Admin', memberName: 'Partner', mega: { name: 'Coral', look: { hex: '#F2766B', sticker: 'heart' }, personality: 'cheerful' }, family: FAMILY };
const KID: InvitePreview = { status: 'ok', kind: 'kid', inviterName: 'Admin', memberName: 'Twin 1', mega: { name: 'Zap', look: { hex: '#8E6CE0', sticker: 'bolt' }, personality: 'funny' }, family: FAMILY };

describe('invite screen', () => {
  // G8: on the phone the middle card is "Scan QR code"; the web keeps "No link yet?" (InviteScreenG8.test.tsx).
  test('the field, an example and Continue sit right under the instructions; the Scan card fills the middle', async () => {
    await renderScreen(<InviteRoute />);
    expect(screen.getByText('Looks like mega.family/join/7QK2-M4XD, or just 7QK2-M4XD')).toBeTruthy();
    expect(screen.getByText('Scan QR code')).toBeTruthy();
  });
});

describe('join: loading and bad invites', () => {
  test('while the invite loads: the walking-MEGA loader, never blank', async () => {
    mockPreview = undefined;
    await renderScreen(<JoinRoute />);
    expect(screen.getByText('Opening your invite')).toBeTruthy();
  });

  test('expired: its own card, and "Use a new invite" goes back to the invite screen', async () => {
    mockPreview = { status: 'expired', inviterName: 'Admin' };
    await renderScreen(<JoinRoute />);
    expect(screen.getByText('This invite expired')).toBeTruthy();
    expect(screen.getByText('Invites last 3 days. Ask Admin to send you a new one.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Use a new invite')));
    expect(router.replace).toHaveBeenCalledWith('/invite');
  });

  test('locked (already five wrong codes): the locked screen straight away', async () => {
    mockPreview = { status: 'locked', inviterName: 'Admin' };
    await renderScreen(<JoinRoute />);
    expect(screen.getByText('This invite is locked')).toBeTruthy();
  });

  test('an unknown link: a friendly "didn’t work" screen', async () => {
    mockPreview = { status: 'invalid' };
    await renderScreen(<JoinRoute />);
    expect(screen.getByText('That invite didn’t work')).toBeTruthy();
  });
});

describe('join: adult invite', () => {
  test('shows who invited them, the MEGA made for them and who is already here; no parent code', async () => {
    mockPreview = ADULT;
    await renderScreen(<JoinRoute />);
    expect(screen.getByText('Admin invited you')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Join the family' })).toBeTruthy();
    expect(screen.getByText('Coral')).toBeTruthy();
    expect(screen.getByText('Your MEGA · cheerful · picked by Admin')).toBeTruthy();
    expect(screen.getByText('Already here')).toBeTruthy();
    expect(screen.getByText('Twin 1')).toBeTruthy();
    expect(screen.queryByLabelText('Parent code')).toBeNull();
    expect(screen.queryByText(/Hub is your family/)).toBeNull();
  });

  test('"Looks good, join" joins with the MEGA as it is and goes to chat', async () => {
    mockPreview = ADULT;
    mockRedeem.mockResolvedValueOnce({ memberId: 'm1' });
    await renderScreen(<JoinRoute />);
    await act(async () => fireEvent.press(screen.getByText('Looks good, join')));
    expect(mockRedeem).toHaveBeenCalledWith({ token: 'TOKEN123' });
    expect(router.replace).toHaveBeenCalledWith('/chat');
  });

  test('"Change my MEGA": a new name and look apply when they join', async () => {
    mockPreview = ADULT;
    mockRedeem.mockResolvedValueOnce({ memberId: 'm1' });
    await renderScreen(<JoinRoute />);
    await act(async () => fireEvent.press(screen.getByText('Change my MEGA')));
    expect(screen.getByText('Make it yours')).toBeTruthy();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Name'), 'Ember'));
    await act(async () => fireEvent.press(screen.getByText('Save')));
    expect(screen.getByText('Ember')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Looks good, join')));
    expect(mockRedeem).toHaveBeenCalledWith({ token: 'TOKEN123', mega: { name: 'Ember', look: { hex: '#F2766B', sticker: 'heart' }, personality: 'cheerful' } });
  });
});

describe('join: kid invite', () => {
  test('a big MEGA made for them, a grown-up step, and no way to change the MEGA', async () => {
    mockPreview = KID;
    await renderScreen(<JoinRoute />);
    expect(screen.getByText('Zap is ready to meet you!')).toBeTruthy();
    expect(screen.getByText('Admin made Zap just for you.')).toBeTruthy();
    expect(screen.getByText('Grown-up step')).toBeTruthy();
    expect(screen.queryByText('Change my MEGA')).toBeNull();
  });

  test('"A grown-up is here" → the parent code (5 digits only) → joins and goes to chat', async () => {
    mockPreview = KID;
    mockRedeem.mockResolvedValueOnce({ memberId: 'm1' });
    await renderScreen(<JoinRoute />);
    await act(async () => fireEvent.press(screen.getByText('A grown-up is here')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Parent code'), '12a3456'));
    await act(async () => fireEvent.press(screen.getByText('Join the family')));
    expect(mockRedeem).toHaveBeenCalledWith({ token: 'TOKEN123', parentCode: '12345' });
    expect(router.replace).toHaveBeenCalledWith('/chat');
  });

  test('a wrong parent code shows the friendly line and stays on the screen', async () => {
    mockPreview = KID;
    mockRedeem.mockRejectedValueOnce(new ConvexError({ code: 'WRONG_PARENT_CODE' }));
    await renderScreen(<JoinRoute />);
    await act(async () => fireEvent.press(screen.getByText('A grown-up is here')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Parent code'), '12345'));
    await act(async () => fireEvent.press(screen.getByText('Join the family')));
    expect(screen.getByText("That parent code didn't match.")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('five wrong codes (RATE_LIMITED) lock the invite; "Use a new invite" goes back to the invite screen', async () => {
    mockPreview = KID;
    mockRedeem.mockRejectedValueOnce(new ConvexError({ code: 'RATE_LIMITED' }));
    await renderScreen(<JoinRoute />);
    await act(async () => fireEvent.press(screen.getByText('A grown-up is here')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Parent code'), '12345'));
    await act(async () => fireEvent.press(screen.getByText('Join the family')));
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
    // G5: Start a family begins the onboarding chat right here (no interim screen); the gate opens Chat.
    await act(async () => fireEvent.press(screen.getByLabelText('Start a family')));
    expect(mockBegin).toHaveBeenCalledWith({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    expect(router.push).not.toHaveBeenCalledWith('/onboarding');
    await act(async () => fireEvent.press(screen.getByLabelText('Join a family')));
    expect(router.push).toHaveBeenCalledWith('/invite');
    await act(async () => fireEvent.press(screen.getByLabelText('Use a different account')));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
