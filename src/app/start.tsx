// "Join or start a family" (PLAN.md → Onboarding): shown once signed in but `me.get` has no member yet —
// most often an adult who signed in with Apple/Google and hasn't redeemed an invite.
import { router } from 'expo-router';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function StartRoute() {
  const tokens = useTokens();
  return (
    <Screen>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.lg }}>
        Join or start a family
      </Text>
      <Card style={{ gap: tokens.spacing.md }}>
        <Button label="Start a family" onPress={() => router.push('/onboarding')} />
        <Button label="I have an invite" variant="secondary" onPress={() => router.push('/invite')} />
      </Card>
    </Screen>
  );
}
