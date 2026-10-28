// PLAN.md → Sign-in: the auth gate, split out of `src/app/_layout.tsx` so it can be rendered (and
// tested — see AuthGate.test.tsx) on its own, with `@/services/auth` and `@/data/useViewer` mocked.
// Exactly one of four states is active at any time: auth still loading; signed out; signed in but not
// yet a family member (`me.get` returned null); signed in with a member.
import { Stack } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { useAuthState } from '@/services/auth';
import { OpeningScreen } from '@/features/signin/OpeningScreen';
import { useThemedStackOptions } from '@/features/shell/stackOptions';

export function AuthGate() {
  const authState = useAuthState();
  const viewer = useViewer();
  const screenOptions = useThemedStackOptions();

  // Both loading phases render the same OpeningScreen at the same position, so it isn't remounted between
  // them (a fast returning user sees only the background, then chat; a slow one sees the MEGAs walk in).
  if (authState.status === 'loading' || (authState.status === 'signedIn' && viewer === undefined)) return <OpeningScreen />;

  const signedOut = authState.status === 'signedOut';
  const needsFamily = authState.status === 'signedIn' && viewer === null;
  const inFamily = authState.status === 'signedIn' && viewer != null;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>

      <Stack.Protected guard={needsFamily}>
        <Stack.Screen name="start" />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
      </Stack.Protected>

      {/* Reachable right after an anonymous sign-in from Welcome, and also once signed in with no
          member yet (an adult who hasn't redeemed an invite) — same screens either way. */}
      <Stack.Protected guard={signedOut || needsFamily}>
        <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
        <Stack.Screen name="join/[token]" options={{ presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Protected guard={inFamily}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="talk" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="today" options={{ presentation: 'modal' }} />
        <Stack.Screen name="mega-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="widgets" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}
