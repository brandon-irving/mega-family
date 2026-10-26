import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import type { TypeScaleKey } from '@shared/config/theme';
import { useTokens } from './theme';

export type TextProps = RNTextProps & { variant?: TypeScaleKey; color?: 'text' | 'muted' | 'accent'; weight?: '400' | '500' | '600' | '700' };

/** Reads only from design tokens: font size/weight come from the role-sized type scale, color from theme. */
export function Text({ variant = 'body', color = 'text', weight, style, ...rest }: TextProps) {
  const tokens = useTokens();
  const scale = tokens.type[variant];
  const textColor = color === 'accent' ? tokens.accent : color === 'muted' ? tokens.muted : tokens.text;
  return (
    <RNText
      accessibilityRole="text"
      style={[{ fontSize: scale.fontSize, lineHeight: scale.lineHeight, fontWeight: weight ?? scale.fontWeight, color: textColor }, style]}
      {...rest}
    />
  );
}
