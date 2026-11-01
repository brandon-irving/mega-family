import { messageBubbleColors } from '@shared/config/theme';
import { Bubble } from '@/ui/Bubble';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

/** Kept in the message list so a long response scrolls instead of pushing the composer off screen. */
export function StreamingReply({ megaName, text, megaHex }: { megaName: string; text: string; megaHex?: string }) {
  const tokens = useTokens();
  return (
    <View testID="streaming-reply" accessibilityLabel={`${megaName} is replying`} style={{ marginBottom: tokens.spacing.md }}>
      <Bubble mine={false} accent={megaHex}>
      {text ? <Text style={megaHex ? { color: messageBubbleColors(megaHex).text } : undefined}>{text}</Text> : <Text style={megaHex ? { color: messageBubbleColors(megaHex).text } : undefined} accessibilityLiveRegion="polite">Thinking…</Text>}
      </Bubble>
    </View>
  );
}
