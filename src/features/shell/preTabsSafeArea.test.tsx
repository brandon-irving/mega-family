// Seen on the owner's iPhone (Oct 28): signed in without a family, the "Welcome to MEGA" screen
// (src/app/onboarding.tsx, a fullScreenModal) drew its title under the status bar — web never showed it
// because web has no notch. Every route reached before the tabs (welcome, start, onboarding, invite, join)
// keeps its content below a simulated 59pt top inset (iPhone with Dynamic Island) and above the 34pt home
// indicator. The page-sheet modals (invite, join) leave it to the native view, which pads where they meet it.
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderWithTheme } from '@/test/renderWithTheme';
import StartRoute from '@/app/start';
import WelcomeRoute from '@/app/welcome';

jest.mock('convex/react', () => ({ useMutation: () => jest.fn() }));
jest.mock('@/services/auth', () => ({
  signInAnonymously: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => Promise.resolve()),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
  signInWithEmail: jest.fn(() => Promise.resolve()),
  signUpWithEmail: jest.fn(() => Promise.resolve()),
  appleSignInOffIos: () => false,
  useSignedInEmail: () => 'admin@example.com',
  signOut: jest.fn(),
}));
jest.mock('@/services/AppleSignInButton', () => ({ AppleSignInButton: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false }, Redirect: () => null }));

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const inset = (ui: React.ReactElement) => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
const pad = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as { paddingTop?: number; paddingBottom?: number };

describe('routes before the tabs respect the top and bottom insets', () => {
  test('start (join or start a family; G5: the onboarding itself is the chat)', async () => {
    const view = await inset(<StartRoute />);
    expect(pad(view.getByTestId('start-safe')).paddingTop).toBe(59);
  });

  test('welcome', async () => {
    const view = await inset(<WelcomeRoute demoMode={false} />);
    expect(pad(view.getByTestId('welcome-safe')).paddingTop).toBe(59);
  });
});
