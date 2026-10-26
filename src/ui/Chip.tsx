import { Pressable } from 'react-native';
import { Text } from './Text';
import { useTokens } from './theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/** A tappable pill — used for choice-block options, filters and the SaveChip under a message. */
export function Chip({ label, selected = false, onPress, accessibilityLabel, testID }: ChipProps) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={{
        minHeight: onPress ? tokens.touchTarget : undefined,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.md,
        borderRadius: tokens.radii.pill,
        borderWidth: 1,
        borderColor: selected ? tokens.accent : tokens.line,
        backgroundColor: selected ? tokens.accent : tokens.surface,
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      <Text variant="label" color={selected ? undefined : 'text'} style={selected ? { color: contrastOn(tokens.accent) } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Cheap luminance check so chip labels stay legible on any accent color. */
function contrastOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#14171C' : '#FFFFFF';
}
