// G8 (CONTRACT v0.18 decision 6, G8.md invariant 8; boards LoginInvite and IcsPaste, the Paste button in a
// one-line field): paste
// only on a tap. On iOS 16+ the system paste control (`ClipboardPasteButton`, UIPasteControl) pastes with no
// "Allow Paste" prompt; elsewhere our own button reads `getStringAsync()` inside the press (on iOS that shows
// the system prompt, and a denied prompt reads as '' — the same as an empty clipboard). Never on mount/focus.
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { G8_COPY } from '@shared/config/copy';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

/** The system control's fixed size (Apple sizes it from its frame; label "Paste" with the icon). */
const SIZE = { width: 96, height: 36 } as const;

/** Fixed size, so a field can leave room for it inside its right edge. */
export const PASTE_BUTTON_WIDTH = SIZE.width;

export function PasteButton({ label, onPasted }: { label: string; onPasted: (text: string) => void }) {
  const tokens = useTokens();
  if (Clipboard.isPasteButtonAvailable) {
    return (
      <View style={{ width: SIZE.width, height: SIZE.height }} accessibilityLabel={label}>
        <Clipboard.ClipboardPasteButton
          acceptedContentTypes={['plain-text', 'url']}
          backgroundColor={tokens.surface}
          foregroundColor={tokens.text}
          cornerStyle="capsule"
          displayMode="iconAndLabel"
          style={SIZE}
          onPress={(data) => onPasted(data.type === 'text' ? data.text : '')}
        />
      </View>
    );
  }
  return (
    <Pressable
      onPress={async () => onPasted(await Clipboard.getStringAsync())}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={tokens.hitSlop}
      style={({ pressed }) => ({
        minWidth: tokens.touchTarget,
        height: SIZE.height,
        paddingHorizontal: tokens.spacing.md,
        borderRadius: tokens.radii.pill,
        backgroundColor: tokens.bg,
        borderWidth: 1,
        borderColor: tokens.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="label" weight="600">
        {G8_COPY.paste}
      </Text>
    </Pressable>
  );
}
