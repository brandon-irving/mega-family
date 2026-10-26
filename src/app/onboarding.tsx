// Onboarding placeholder (G1 scope item 9 — the conversational onboarding flow is a later gate).
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function OnboardingRoute() {
  const tokens = useTokens();
  return (
    <Screen>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.md }}>
        Welcome to MEGA
      </Text>
      <Text color="muted" style={{ marginBottom: tokens.spacing.lg }}>
        The conversational onboarding flow (make your MEGA, add your family) arrives in a later milestone.
      </Text>
      <Button label="Go to chat" onPress={() => router.replace('/chat' as never)} />
    </Screen>
  );
}
