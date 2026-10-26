// PLAN.md → Sign-in. Convex and the auth service are mocked — this is a pure rendering test of what
// Welcome shows for a given `demoMode`, not a test of real sign-in.
// Lives outside src/app/ (AGENTS.md: every file in src/app/ is a route — a *.test.tsx there would become
// a screen Expo Router tries to bundle and serve).
import { Platform } from 'react-native';
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import WelcomeRoute from '@/app/welcome';

jest.mock('convex/react', () => ({ useMutation: () => jest.fn() }));
jest.mock('@/services/auth', () => ({
  signInAnonymously: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
}));

describe('WelcomeRoute', () => {
  test('always shows "Continue with Google" and "I have an invite"', async () => {
    await renderWithTheme(<WelcomeRoute demoMode={false} />);
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.getByText('I have an invite')).toBeTruthy();
  });

  test('"Continue with Apple" only renders on iOS', async () => {
    await renderWithTheme(<WelcomeRoute demoMode={false} />);
    if (Platform.OS === 'ios') {
      expect(screen.getByText('Continue with Apple')).toBeTruthy();
    } else {
      expect(screen.queryByText('Continue with Apple')).toBeNull();
    }
  });

  test('demo list is hidden when demoMode is off', async () => {
    await renderWithTheme(<WelcomeRoute demoMode={false} />);
    expect(screen.queryByText('Demo: sign in as…')).toBeNull();
    expect(screen.queryByText('Admin')).toBeNull();
  });

  test('demo list shows all four sample members when demoMode is on', async () => {
    await renderWithTheme(<WelcomeRoute demoMode />);
    expect(screen.getByText('Demo: sign in as…')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('Partner')).toBeTruthy();
    expect(screen.getByText('Twin 1')).toBeTruthy();
    expect(screen.getByText('Twin 2')).toBeTruthy();
  });
});
