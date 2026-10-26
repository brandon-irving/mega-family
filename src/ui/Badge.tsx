import type { ReactNode } from 'react';
import { View } from 'react-native';

export type BadgeProps = { children: ReactNode; size?: number; background?: string };

/** The small white rounded tile a MEGA head (or any small glyph) sits on, per PLAN §visual direction. */
export function Badge({ children, size = 44, background = '#FFFFFF' }: BadgeProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}
