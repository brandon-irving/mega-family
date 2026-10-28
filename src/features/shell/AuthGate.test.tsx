// PLAN.md → Sign-in. Exercises the real `AuthGate` + Stack.Protected guards through expo-router's own
// testing-library, against a synthetic route tree standing in for welcome/start/onboarding/(tabs) — real
// navigation behavior (including a disallowed initial route redirecting to the accessible one), with
// `@/services/auth` and `@/data/useViewer` mocked so every state is reachable without a real session or a
// real Convex deployment.
import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { ThemeProvider } from '@/ui/theme';
import { useAuthState } from '@/services/auth';
import { useViewer } from '@/data/useViewer';
import { AuthGate } from './AuthGate';

jest.mock('@/services/auth', () => ({ useAuthState: jest.fn() }));
jest.mock('@/data/useViewer', () => ({ useViewer: jest.fn() }));

const mockUseAuthState = useAuthState as jest.Mock;
const mockUseViewer = useViewer as jest.Mock;

/** Mirrors the real `_layout.tsx`'s nesting (ThemeProvider only — Convex/AppThemeProvider aren't needed
 * since the hooks that would read them are mocked). */
function TestLayout() {
  return (
    <ThemeProvider>
      <AuthGate />
    </ThemeProvider>
  );
}

// Named (not inline-arrow-factory) stand-in screens, one per mock route — each just renders its own
// label so the tests can assert on which one is visible.
function WelcomeStub() {
  return <Text>WELCOME_SCREEN</Text>;
}
function StartStub() {
  return <Text>START_SCREEN</Text>;
}
function OnboardingStub() {
  return <Text>ONBOARDING_SCREEN</Text>;
}
function InviteStub() {
  return <Text>INVITE_SCREEN</Text>;
}
function JoinStub() {
  return <Text>JOIN_SCREEN</Text>;
}
function TabsStub() {
  return <Text>TABS_SCREEN</Text>;
}
function TalkStub() {
  return <Text>TALK_SCREEN</Text>;
}
function TodayStub() {
  return <Text>TODAY_SCREEN</Text>;
}
function MegaProfileStub() {
  return <Text>MEGA_PROFILE_SCREEN</Text>;
}
function SettingsStub() {
  return <Text>SETTINGS_SCREEN</Text>;
}
function WidgetsStub() {
  return <Text>WIDGETS_SCREEN</Text>;
}

const ROUTES = {
  _layout: TestLayout,
  welcome: WelcomeStub,
  start: StartStub,
  onboarding: OnboardingStub,
  invite: InviteStub,
  'join/[token]': JoinStub,
  '(tabs)/index': TabsStub,
  talk: TalkStub,
  today: TodayStub,
  'mega-profile': MegaProfileStub,
  settings: SettingsStub,
  widgets: WidgetsStub,
};

describe('AuthGate', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Screen 9 (LoginOpening board): loading is the opening screen — background only at first (no spinner,
  // no label, so a fast returning user goes straight into chat with nothing flashing).
  test('auth loading: shows the opening screen', async () => {
    mockUseAuthState.mockReturnValue({ status: 'loading' });
    mockUseViewer.mockReturnValue(undefined);
    await renderRouter(ROUTES, { initialUrl: '/welcome' });
    expect(screen.getByTestId('opening')).toBeTruthy();
    expect(screen.queryByText('WELCOME_SCREEN')).toBeNull();
  });

  test('signed in but viewer still loading: shows the opening screen too (not the "join or start" choice yet)', async () => {
    mockUseAuthState.mockReturnValue({ status: 'signedIn' });
    mockUseViewer.mockReturnValue(undefined);
    await renderRouter(ROUTES, { initialUrl: '/start' });
    expect(screen.getByTestId('opening')).toBeTruthy();
    expect(screen.queryByText('START_SCREEN')).toBeNull();
  });

  test('signed out: renders Welcome', async () => {
    mockUseAuthState.mockReturnValue({ status: 'signedOut' });
    mockUseViewer.mockReturnValue(null);
    await renderRouter(ROUTES, { initialUrl: '/welcome' });
    expect(screen.getByText('WELCOME_SCREEN')).toBeTruthy();
  });

  test('signed out can never reach the "join or start a family" screen', async () => {
    mockUseAuthState.mockReturnValue({ status: 'signedOut' });
    mockUseViewer.mockReturnValue(null);
    await renderRouter(ROUTES, { initialUrl: '/start' });
    expect(screen.queryByText('START_SCREEN')).toBeNull();
  });

  test('signed in, me.get returned null: renders the "join or start a family" choice', async () => {
    mockUseAuthState.mockReturnValue({ status: 'signedIn' });
    mockUseViewer.mockReturnValue(null);
    await renderRouter(ROUTES, { initialUrl: '/start' });
    expect(screen.getByText('START_SCREEN')).toBeTruthy();
  });

  test('signed in with no member can still reach the invite screen (shared with signed-out)', async () => {
    mockUseAuthState.mockReturnValue({ status: 'signedIn' });
    mockUseViewer.mockReturnValue(null);
    await renderRouter(ROUTES, { initialUrl: '/invite' });
    expect(screen.getByText('INVITE_SCREEN')).toBeTruthy();
  });

  test('signed in with a member: renders the tabs', async () => {
    mockUseAuthState.mockReturnValue({ status: 'signedIn' });
    mockUseViewer.mockReturnValue({ member: { name: 'Admin' } });
    await renderRouter(ROUTES, { initialUrl: '/(tabs)' });
    expect(screen.getByText('TABS_SCREEN')).toBeTruthy();
  });

  test('a family member trying to reach Welcome or "join or start" is redirected into the tabs', async () => {
    mockUseAuthState.mockReturnValue({ status: 'signedIn' });
    mockUseViewer.mockReturnValue({ member: { name: 'Admin' } });
    await renderRouter(ROUTES, { initialUrl: '/start' });
    expect(screen.queryByText('START_SCREEN')).toBeNull();
    expect(screen.getByText('TABS_SCREEN')).toBeTruthy();
  });
});
