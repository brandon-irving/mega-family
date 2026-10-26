// Welcome (PLAN.md → Sign-in): shown while signed out. Apple is iOS-only; Google works everywhere;
// "I have an invite" is the shared first step for kids and partners (an anonymous session, then the
// invite's code takes it from there — see src/app/invite.tsx and src/app/join/[token].tsx). The demo
// list only renders when this build opted into EXPO_PUBLIC_DEMO_MODE; the server's own DEMO_MODE gates
// `demo.signInAs` independently, so this flag alone can't reach seeded data on a deployment that didn't
// also turn the backend flag on.
import { useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/data/api';
import { signInAnonymously, signInWithApple, signInWithGoogle } from '@/services/auth';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { IDENTITY } from '@shared/config/identity';
import { SAMPLE_FAMILY, type SampleKey } from '@shared/fixtures/sampleFamily';

const DEMO_KEYS = ['admin', 'partner', 'twin1', 'twin2'] as const;

/** `demoMode` defaults to the env flag; it's a prop (not read straight from `process.env` in the body)
 * so WelcomeRoute.test.tsx can render both states without fighting Metro/babel's static env inlining. */
export default function WelcomeRoute({ demoMode = process.env.EXPO_PUBLIC_DEMO_MODE === 'true' }: { demoMode?: boolean } = {}) {
  const tokens = useTokens();
  const signInAs = useMutation(api.demo.signInAs);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (key: string, action: () => Promise<void>) => async () => {
    setError(null);
    setBusy(key);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const onInvite = run('invite', async () => {
    await signInAnonymously();
    router.push('/invite');
  });

  const onDemo = (key: (typeof DEMO_KEYS)[number]) =>
    run(key, async () => {
      await signInAnonymously();
      await signInAs({ as: key });
    });

  return (
    <Screen scroll>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.xs }}>
        {IDENTITY.name}
      </Text>
      <Text color="muted" style={{ marginBottom: tokens.spacing.xl }}>
        {IDENTITY.tagline}.
      </Text>

      <Card style={{ gap: tokens.spacing.md }}>
        {Platform.OS === 'ios' && <Button label="Continue with Apple" loading={busy === 'apple'} onPress={run('apple', signInWithApple)} />}
        <Button label="Continue with Google" variant={Platform.OS === 'ios' ? 'secondary' : 'primary'} loading={busy === 'google'} onPress={run('google', signInWithGoogle)} />
        <Button label="I have an invite" variant="secondary" loading={busy === 'invite'} onPress={onInvite} />
      </Card>

      {error && (
        <Text color="muted" style={{ marginTop: tokens.spacing.md }}>
          {error}
        </Text>
      )}

      {demoMode && (
        <Card style={{ marginTop: tokens.spacing.xl, gap: tokens.spacing.sm }}>
          <Text variant="label" color="muted">
            Demo: sign in as…
          </Text>
          {DEMO_KEYS.map((key) => {
            const name = SAMPLE_FAMILY.members.find((m) => m.key === (key as SampleKey))!.name;
            return <Button key={key} label={name} variant="ghost" loading={busy === key} onPress={onDemo(key)} />;
          })}
        </Card>
      )}
    </Screen>
  );
}
