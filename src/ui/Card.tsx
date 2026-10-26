import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { useTokens } from './theme';

export type CardProps = ViewProps & { children: ReactNode };

/** The generic surface for result cards, list rows and sheets' inner sections. */
export function Card({ children, style, ...rest }: CardProps) {
  const tokens = useTokens();
  return (
    <View
      style={[{ backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
