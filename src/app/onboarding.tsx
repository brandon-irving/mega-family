// Interim "Start a family" until the conversational onboarding (PLAN.md §5, G5) replaces it: one question,
// then onboarding.start with the admin's MEGA defaults from config. Without it a real Apple/Google sign-in
// had no way into the app (Oct 26). The auth gate moves to the tabs on its own once me.get has a member.
import { useState } from 'react';
import { TextInput } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '@/data/api';
import { UseDifferentAccount } from '@/features/shell/UseDifferentAccount';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { IDENTITY } from '@shared/config/identity';
import { COLORS } from '@shared/config/looks';

/** The admin's first MEGA until they make their own in the onboarding chat (G5). */
const FIRST_MEGA = { name: 'Teal', look: { hex: COLORS.teal, sticker: 'star' as const }, personality: 'calm' as const };

export default function OnboardingRoute() {
  const tokens = useTokens();
  const start = useMutation(api.onboarding.start);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const onStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await start({
        familyName: `${trimmed}'s family`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        myName: trimmed,
        look: FIRST_MEGA.look,
        personality: FIRST_MEGA.personality,
        megaName: FIRST_MEGA.name,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.md }}>
        Welcome to {IDENTITY.name}
      </Text>
      <Card style={{ gap: tokens.spacing.sm }}>
        <Text color="muted">What should your MEGA call you?</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={tokens.muted}
          autoCapitalize="words"
          returnKeyType="go"
          onSubmitEditing={() => trimmed && !busy && onStart()}
          style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
          accessibilityLabel="Your name"
        />
        {error ? <Text color="muted">{error}</Text> : null}
        <Button label="Start my family" disabled={!trimmed || busy} onPress={onStart} />
      </Card>
      <UseDifferentAccount />
    </Screen>
  );
}
