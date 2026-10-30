import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

/** Kept in the message list so a long response scrolls instead of pushing the composer off screen. */
export function StreamingReply({ megaName, text }: { megaName: string; text: string }) {
  const tokens = useTokens();
  return (
    <View testID="streaming-reply" style={{ marginBottom: tokens.spacing.md }}>
      <Text variant="caption" color="muted" style={{ marginBottom: tokens.spacing.xs }}>
        {megaName}
      </Text>
      {text ? <Text>{text}</Text> : <Text color="muted" accessibilityLiveRegion="polite">Thinking…</Text>}
    </View>
  );
}
