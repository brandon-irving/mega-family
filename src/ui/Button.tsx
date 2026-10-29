import { ActivityIndicator, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { readableOn } from '@shared/config/theme';
import { useContentRect } from './contentRegistry';
import { Text } from './Text';
import { useTokens } from './theme';

export type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  /** `inverse`: text-colored fill with background-colored ink (the sign-in boards' main button);
   * `outline`: transparent with a line border; `danger`: a destructive confirm (G5's Disconnect sheet). */
  variant?: 'primary' | 'secondary' | 'ghost' | 'inverse' | 'outline' | 'danger';
  /** Fully rounded ends (the sign-in boards' pill buttons). */
  pill?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** G3 review fix (HIGH, kid button sizes): an explicit height + label font size, overriding the
   * default `tokens.touchTarget`/type-scale pair — `ButtonRow` passes `tokens.buttonSize` (resolved from
   * the viewer's role, shared/config/theme.ts BUTTON_SIZES) for notification/request/choice-block action
   * buttons, which the design board sizes exactly (44/54pt, 15/18pt) rather than the generic scale every
   * other button uses. Never a per-call magic number — always a token. */
  size?: { height: number; fontSize: number };
};

/** The one tappable-button primitive; every screen's buttons go through this. */
export function Button({ label, variant = 'primary', pill = false, loading, accessibilityLabel, disabled, style, size, onLayout, ...rest }: ButtonProps) {
  const tokens = useTokens();
  // On a walker stage, the whole button is content MEGAs never cover (owner, Oct 28).
  const { ref: contentRef, onLayout: onContentLayout } = useContentRect(onLayout);
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const isInverse = variant === 'inverse';
  const isOutline = variant === 'outline';
  const isDanger = variant === 'danger';
  // G2 contrast fix: tokens.onAccent is a per-theme constant (white), but a primary button's background
  // is tokens.accent, which can resolve to a MEGA's custom hex ("Match my MEGA") — readableOn derives the
  // actual WCAG-AA-passing text color for *that* background instead of assuming white always works.
  const onAccentText = readableOn(tokens.accent);
  const ink = isPrimary ? onAccentText : isDanger ? readableOn(tokens.danger) : isInverse ? tokens.bg : isGhost ? tokens.accent : tokens.text;
  return (
    <Pressable
      ref={contentRef}
      onLayout={onContentLayout}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: size?.height ?? tokens.touchTarget,
          paddingHorizontal: tokens.spacing.lg,
          borderRadius: pill ? tokens.radii.pill : tokens.radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: tokens.spacing.sm,
          opacity: pressed ? 0.8 : disabled ? 0.5 : 1,
          backgroundColor: isPrimary ? tokens.accent : isDanger ? tokens.danger : isInverse ? tokens.text : isGhost || isOutline ? 'transparent' : tokens.surface,
          borderWidth: isGhost ? 0 : 1,
          borderColor: isPrimary ? tokens.accent : isDanger ? tokens.danger : isInverse ? tokens.text : tokens.line,
        },
        style,
      ]}
      {...rest}
    >
      {loading && <ActivityIndicator color={isPrimary || isInverse || isDanger ? ink : tokens.accent} />}
      <Text variant="label" style={[{ color: ink }, size ? { fontSize: size.fontSize, lineHeight: size.fontSize + 5 } : undefined]}>
        {label}
      </Text>
    </Pressable>
  );
}
