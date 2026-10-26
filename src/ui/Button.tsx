import { ActivityIndicator, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTokens } from './theme';

export type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** The one tappable-button primitive; every screen's buttons go through this. */
export function Button({ label, variant = 'primary', loading, accessibilityLabel, disabled, style, ...rest }: ButtonProps) {
  const tokens = useTokens();
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: tokens.touchTarget,
          paddingHorizontal: tokens.spacing.lg,
          borderRadius: tokens.radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: tokens.spacing.sm,
          opacity: pressed ? 0.8 : disabled ? 0.5 : 1,
          backgroundColor: isPrimary ? tokens.accent : isGhost ? 'transparent' : tokens.surface,
          borderWidth: isGhost ? 0 : 1,
          borderColor: isPrimary ? tokens.accent : tokens.line,
        },
        style,
      ]}
      {...rest}
    >
      {loading && <ActivityIndicator color={isPrimary ? '#FFFFFF' : tokens.accent} />}
      <Text variant="label" style={{ color: isPrimary ? '#FFFFFF' : isGhost ? tokens.accent : tokens.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
