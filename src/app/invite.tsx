// Enter (or paste a link containing) an invite token, then hand off to join/[token] for the actual
// redeem (PLAN.md → Onboarding: "a QR code… or an invite link"). Scanning the QR code itself needs a
// camera dependency and is a later gate; pasting the link or its code works today.
import { useState } from 'react';
import { TextInput } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

function extractToken(input: string): string {
  const trimmed = input.trim();
  return trimmed.split('/').filter(Boolean).pop() ?? trimmed;
}

export default function InviteRoute() {
  const tokens = useTokens();
  const [input, setInput] = useState('');
  const token = extractToken(input);

  return (
    <Screen>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.md }}>
        I have an invite
      </Text>
      <Card style={{ gap: tokens.spacing.sm }}>
        <Text color="muted">Paste the invite link, or just its code.</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="mega://join/…"
          placeholderTextColor={tokens.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
          accessibilityLabel="Invite link or code"
        />
        <Button label="Continue" disabled={!token} onPress={() => router.push(`/join/${token}` as never)} />
      </Card>
    </Screen>
  );
}
