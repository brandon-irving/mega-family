// PLAN.md → Sign-in: the auth gate, split out of `src/app/_layout.tsx` so it can be rendered (and
// tested — see AuthGate.test.tsx) on its own, with `@/services/auth` and `@/data/useViewer` mocked.
// Exactly one of four states is active at any time: auth still loading; signed out; signed in but not
// yet a family member (`me.get` returned null); signed in with a member.
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { useAuthState } from '@/services/auth';
import { releaseSignIn, useSignInHeld } from '@/services/signInHold';
import { MegaLoader } from '@/features/walkers';
import { useThemedStackOptions } from '@/features/shell/stackOptions';

export function AuthGate() {
  const authState = useAuthState();
  const viewer = useViewer();
  const screenOptions = useThemedStackOptions();
  const held = useSignInHeld();
  const hasMember = viewer != null;

  // A held sign-in (demo: anonymous session, then signInAs) is done once the member arrives.
  useEffect(() => {
    if (held && hasMember) releaseSignIn();
  }, [held, hasMember]);

  // Every loading phase renders the same loader at the same position, so it isn't remounted between them:
  // "Opening chats" with a MEGA pacing on it, from the first frame (owner, Oct 28: never blank). That
  // includes a held sign-in that hasn't reached its member yet (no "join or start" flash on the way).
  const loading = authState.status === 'loading' || (authState.status === 'signedIn' && viewer === undefined) || (held && !hasMember && authState.status !== 'signedOut');
  if (loading) return <MegaLoader testID="opening" />;

  const signedOut = authState.status === 'signedOut';
  const needsFamily = authState.status === 'signedIn' && viewer === null;
  const inFamily = authState.status === 'signedIn' && viewer != null;

  return (
    <Stack key={viewer?.member._id ?? authState.status} screenOptions={screenOptions}>
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>

      <Stack.Protected guard={needsFamily}>
        {/* G5: "Start a family" calls onboarding.begin here; the onboarding itself is the chat. */}
        <Stack.Screen name="start" />
      </Stack.Protected>

      {/* Reachable right after an anonymous sign-in from Welcome, and also once signed in with no
          member yet (an adult who hasn't redeemed an invite) — same screens either way. */}
      <Stack.Protected guard={signedOut || needsFamily}>
        <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
        {/* G8: the invite QR scanner (native only; the route sends the web back to the invite screen). */}
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="join/[token]" options={{ presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Protected guard={inFamily}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="talk" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="family/calendar" options={{ presentation: 'modal' }} />
        <Stack.Screen name="family/lists" options={{ presentation: 'modal' }} />
        <Stack.Screen name="family/[memberId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="today" options={{ presentation: 'modal' }} />
        <Stack.Screen name="mega-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="demo-console" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="widgets" options={{ presentation: 'modal' }} />
        {/* GD (Screens 10–11): the parent's homework photo, the kid's morning routine and the Store. */}
        <Stack.Screen name="homework" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="routine/morning" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="store" options={{ presentation: 'modal' }} />
        {/* G4 (Screen 14): family places, and a kid's blocked/changed searches for their parents. */}
        <Stack.Screen name="places" options={{ presentation: 'modal' }} />
        <Stack.Screen name="searches/[memberId]" options={{ presentation: 'modal' }} />
        {/* G5 (Screen 16): Settings → Connected accounts, and a kid's Rules and limits for their parents. */}
        <Stack.Screen name="scheduling" options={{ presentation: 'modal' }} />
        <Stack.Screen name="accounts" options={{ presentation: 'modal' }} />
        <Stack.Screen name="rules/[memberId]" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}
