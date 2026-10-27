import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { readableOn } from '@shared/config/theme';
import { Text } from './Text';
import { useTokens } from './theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  /** G3 review fix (HIGH, kid button sizes): an explicit height + label font size — see Button.tsx's
   * `size` prop for why (the design board's exact 44/54pt, 15/18pt pair, distinct from the generic
   * touch-target scale this component uses by default). Passed by ChoiceBlock (Blocks.tsx) for its
   * option chips, which the review item calls out alongside notification/request cards. */
  size?: { height: number; fontSize: number };
  /** Lets a caller lay chips out itself (ChoiceBlock's 2-up grid) — merged after the default styles, so
   * it can override `alignSelf`/`flexBasis` without fighting them. */
  style?: StyleProp<ViewStyle>;
};

/** A tappable pill — used for choice-block options, filters and the SaveChip under a message. With no
 * `onPress` it's a plain, non-interactive label (SaveChip's read-only mode for kids, PLAN "MEGA profile":
 * kids "don't get sharing or memory"). */
export function Chip({ label, selected = false, onPress, accessibilityLabel, testID, size, style }: ChipProps) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !onPress }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[
        {
          minHeight: size?.height ?? (onPress ? tokens.touchTarget : undefined),
          paddingVertical: tokens.spacing.sm,
          paddingHorizontal: tokens.spacing.md,
          borderRadius: tokens.radii.pill,
          borderWidth: 1,
          borderColor: selected ? tokens.accent : tokens.line,
          backgroundColor: selected ? tokens.accent : tokens.surface,
          justifyContent: 'center',
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text variant="label" color={selected ? undefined : 'text'} style={[selected ? { color: readableOn(tokens.accent) } : undefined, size ? { fontSize: size.fontSize, lineHeight: size.fontSize + 5 } : undefined]}>
        {label}
      </Text>
    </Pressable>
  );
}
