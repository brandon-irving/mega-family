// mega://join/<token> — redeem an invite (PLAN §5 Onboarding/Joining).
import { useState } from 'react';
import { TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/data/api';
import { useAction } from 'convex/react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function JoinRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [parentCode, setParentCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // CONTRACT.md v0.5: invites.redeem is an action, not a mutation (see convex/invites.ts's docstring —
  // the wrong-parent-code attempt counter needs to commit even when this call itself still fails).
  const redeem = useAction(api.invites.redeem);
  const tokens = useTokens();

  const onJoin = async () => {
    try {
      await redeem({ token, parentCode: parentCode || undefined });
      router.replace('/chat' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Check the code and try again.');
    }
  };

  return (
    <Screen>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.lg }}>
        Join your family
      </Text>
      <Card>
        <Text color="muted" style={{ marginBottom: tokens.spacing.sm }}>
          Kids need the 5-digit parent code; adults can leave it blank.
        </Text>
        <TextInput
          value={parentCode}
          onChangeText={setParentCode}
          placeholder="Parent code (kids only)"
          placeholderTextColor={tokens.muted}
          keyboardType="number-pad"
          style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget, marginBottom: tokens.spacing.sm }}
          accessibilityLabel="Parent code"
        />
        <Button label="Join" onPress={onJoin} />
        {error && (
          <Text color="muted" style={{ marginTop: tokens.spacing.sm }}>
            {error}
          </Text>
        )}
      </Card>
    </Screen>
  );
}
