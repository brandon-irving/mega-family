import { Pressable } from 'react-native';
import { readableOn } from '@shared/config/theme';
import { Text } from './Text';
import { useTokens } from './theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/** A tappable pill — used for choice-block options, filters and the SaveChip under a message. With no
 * `onPress` it's a plain, non-interactive label (SaveChip's read-only mode for kids, PLAN "MEGA profile":
 * kids "don't get sharing or memory"). */
export function Chip({ label, selected = false, onPress, accessibilityLabel, testID }: ChipProps) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !onPress }}
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
      <Text variant="label" color={selected ? undefined : 'text'} style={selected ? { color: readableOn(tokens.accent) } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}
