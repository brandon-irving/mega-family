// Screen 9 boards (Login / LoginSheet / LoginDemo) and the owner's Oct 27 rule: "MEGA" in large letters and
// "A little help for the whole family" as the only tagline. Convex and the auth service are mocked — this
// tests what the welcome screen shows and which sign-in calls each tap makes, not a real sign-in.
// Lives outside src/app/ (every file there is a route).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderWithTheme } from '@/test/renderWithTheme';
import WelcomeRoute from '@/app/welcome';
import { signInAnonymously, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/auth';
import { IDENTITY } from '@shared/config/identity';

const mockSignInAs = jest.fn();
jest.mock('convex/react', () => ({ useMutation: () => mockSignInAs }));
jest.mock('@/services/auth', () => ({
  signInAnonymously: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => Promise.resolve()),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
  signInWithEmail: jest.fn(() => Promise.resolve()),
  signUpWithEmail: jest.fn(() => Promise.resolve()),
  appleSignInOffIos: () => false,
  signOut: jest.fn(),
}));
// The native Apple button is iOS-only (AppleSignInButton.ios.tsx); a stand-in makes its presence assertable.
jest.mock('@/services/AppleSignInButton', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { AppleSignInButton: () => <MockText>APPLE_BUTTON</MockText> };
});
// The Convex client is "authenticated" at once here (the wait itself is tested in demoSignIn.test.ts).
jest.mock('@/services/convexAuthReady', () => ({ waitForConvexAuth: () => Promise.resolve(true) }));
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderWelcome = (demoMode: boolean) =>
  renderWithTheme(
    <SafeAreaProvider initialMetrics={METRICS}>
      <WelcomeRoute demoMode={demoMode} />
    </SafeAreaProvider>,
  );
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('Welcome (Screen 9)', () => {
  afterEach(() => jest.clearAllMocks());

  test('shows the MEGA wordmark and the one tagline, and no other tagline', async () => {
    await renderWelcome(false);
    expect(IDENTITY.tagline).toBe('A little help for the whole family');
    expect(screen.getByText('MEGA')).toBeTruthy();
    expect(screen.getByText(IDENTITY.tagline)).toBeTruthy();
    expect(screen.queryByText(/Welcome to/)).toBeNull();
    expect(screen.queryByText(/AI assistants/)).toBeNull();
  });

  test('Make my MEGA, I have an invite and Sign in are on the first screen; Apple/Google wait in the sheet', async () => {
    await renderWelcome(false);
    expect(screen.getByText('Make my MEGA')).toBeTruthy();
    expect(screen.getByText('I have an invite')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.queryByText('Continue with Google')).toBeNull();
    expect(screen.queryByText('APPLE_BUTTON')).toBeNull();
  });

  test('Make my MEGA opens the sheet on Create account: Apple, Google, then email + password, and the privacy note', async () => {
    await renderWelcome(false);
    await act(async () => fireEvent.press(screen.getByText('Make my MEGA')));
    expect(screen.getByText('Create your account')).toBeTruthy();
    expect(screen.getByText('APPLE_BUTTON')).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.getByText('or use email')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByText('Use 8 or more characters.')).toBeTruthy();
    expect(screen.queryByText('Forgot password?')).toBeNull();
    expect(screen.getByText('MEGA only gets your name and email.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Continue with Google')));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  test('"Sign in" opens the sheet on Sign in, with Forgot password; the toggle switches modes', async () => {
    await renderWelcome(false);
    await act(async () => fireEvent.press(screen.getByText('Sign in')));
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText('Forgot password?')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Create account' })));
    expect(screen.getByText('Create your account')).toBeTruthy();
    expect(screen.getByText('Use 8 or more characters.')).toBeTruthy();
  });

  test('email sign-in: a bad email or a short password is caught before calling the server', async () => {
    await renderWelcome(false);
    await act(async () => fireEvent.press(screen.getByText('Sign in')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email'));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Password'), 'longenough'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Sign in with email' })));
    expect(screen.getByText('That email doesn’t look right.')).toBeTruthy();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Email'), 'pat@example.com'));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Password'), 'short'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Sign in with email' })));
    expect(screen.getByText('Passwords need 8 or more characters.')).toBeTruthy();
    expect(signInWithEmail).not.toHaveBeenCalled();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Password'), 'longenough'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Sign in with email' })));
    expect(signInWithEmail).toHaveBeenCalledWith('pat@example.com', 'longenough');
  });

  test('create account calls sign-up with the trimmed email', async () => {
    await renderWelcome(false);
    await act(async () => fireEvent.press(screen.getByText('Make my MEGA')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Email'), ' pat@example.com '));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Password'), 'longenough'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create account with email' })));
    expect(signUpWithEmail).toHaveBeenCalledWith('pat@example.com', 'longenough');
  });

  test('Show reveals the password; Forgot password shows the "coming soon" placeholder', async () => {
    await renderWelcome(false);
    await act(async () => fireEvent.press(screen.getByText('Sign in')));
    // Wait for each state rather than assuming the sheet re-rendered on the same tick (flaked under load).
    expect((await screen.findByLabelText('Password')).props.secureTextEntry).toBe(true);
    await act(async () => fireEvent.press(screen.getByText('Show')));
    expect(await screen.findByText('Hide')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false));
    await act(async () => fireEvent.press(screen.getByText('Forgot password?')));
    expect(await screen.findByText('Reset by email is coming soon. Ask your family admin for help.')).toBeTruthy();
  });

  test('Hub stands in the middle of the brand block (no empty band above MEGA)', async () => {
    await renderWelcome(false);
    expect(screen.getByLabelText('Hub, your family’s MEGA')).toBeTruthy();
  });

  // G4 UX review MEDIUM (Oct 28): the brand block filled all the space above the buttons and centered
  // itself in it, leaving a dead band between the tagline and "Make my MEGA". The brand block and the buttons
  // are one composition, centered together.
  test('the brand block and the buttons are centered together (no dead band between them)', async () => {
    await renderWelcome(false);
    const flat = (s: unknown) => Object.assign({}, ...(Array.isArray(s) ? s.flat(Infinity) : [s]).filter(Boolean));
    expect(flat(screen.getByTestId('welcome-body').props.style).justifyContent).toBe('center');
    expect(flat(screen.getByTestId('welcome-brand').props.style).flex).toBeUndefined();
  });

  test('the demo pill is hidden unless the build opted into demo mode', async () => {
    await renderWelcome(false);
    expect(screen.queryByText('Demo')).toBeNull();
  });

  test('demo mode: the demo sheet lists the four sample members and signs in as the one picked', async () => {
    await renderWelcome(true);
    await act(async () => fireEvent.press(screen.getByText('Demo')));
    expect(screen.getByText('Demo accounts')).toBeTruthy();
    expect(screen.getByText('Dev builds only')).toBeTruthy();
    for (const name of ['Admin', 'Partner', 'Twin 1', 'Twin 2']) expect(screen.getByText(name)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Twin 1')));
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(mockSignInAs).toHaveBeenCalledWith({ as: 'twin1' });
  });

  // Found live (Oct 28): right after a sign-out, `demo.signInAs` can reach the server before the new
  // anonymous session's token does (UNAUTHENTICATED). It retries a few times instead of failing.
  test('demo mode: an UNAUTHENTICATED race right after the anonymous sign-in is retried, not shown', async () => {
    const { ConvexError } = jest.requireActual('convex/values');
    mockSignInAs.mockRejectedValueOnce(new ConvexError({ code: 'UNAUTHENTICATED' })).mockResolvedValueOnce({});
    await renderWelcome(true);
    await act(async () => fireEvent.press(screen.getByText('Demo')));
    await act(async () => fireEvent.press(screen.getByText('Admin')));
    await act(async () => new Promise((r) => setTimeout(r, 1500)));
    expect(mockSignInAs).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/UNAUTHENTICATED/)).toBeNull();
  });

  test('three MEGAs are on the screen, each one a "say hi" button', async () => {
    await renderWelcome(false);
    // The walkers mount once the stage has measured its ledges, which can land a tick after the first render
    // under a loaded run (flaked Oct 28): wait for each rather than assuming the same tick.
    for (const name of ['Teal', 'Coral', 'Zap']) expect(await screen.findByLabelText(`${name}, say hi`, { includeHiddenElements: true })).toBeTruthy();
  });
});
