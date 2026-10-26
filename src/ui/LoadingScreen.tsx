import { ActivityIndicator } from 'react-native';
import { Screen } from './Screen';
import { Text } from './Text';
import { useTokens } from './theme';

/** Shown while a query is loading (undefined) — every screen that reads live data needs one. */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  const tokens = useTokens();
  return (
    <Screen>
      <ActivityIndicator color={tokens.accent} style={{ marginTop: tokens.spacing.xxl }} />
      <Text color="muted" style={{ textAlign: 'center', marginTop: tokens.spacing.md }}>
        {label}
      </Text>
    </Screen>
  );
}
