import { Bubble } from '@/ui/Bubble';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

/** Kept in the message list so a long response scrolls instead of pushing the composer off screen. */
export function StreamingReply({ megaName, text }: { megaName: string; text: string }) {
  const tokens = useTokens();
  return (
    <View testID="streaming-reply" accessibilityLabel={`${megaName} is replying`} style={{ marginBottom: tokens.spacing.md }}>
      <Bubble mine={false}>
      {text ? <Text>{text}</Text> : <Text color="muted" accessibilityLiveRegion="polite">Thinking…</Text>}
      </Bubble>
    </View>
  );
}
