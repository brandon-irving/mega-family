import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTokens } from './theme';

export type BubbleProps = { children: ReactNode; mine?: boolean };

/**
 * A chat bubble for the viewer's own messages (PLAN §1: "MEGA messages have no bubble; only your
 * own messages are bubbles"). MEGA/system messages render without this, with a MegaBadge beside them.
 */
export function Bubble({ children, mine = true }: BubbleProps) {
  const tokens = useTokens();
  return (
    <View
      testID="bubble"
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        // The message column (MessageRow) holds the 82% limit; a percentage here would resolve against a
        // parent with no width of its own and squeeze short labels to one word per line.
        maxWidth: '100%',
        backgroundColor: mine ? tokens.accent : tokens.surface,
        borderRadius: tokens.radii.lg,
        borderBottomRightRadius: mine ? tokens.radii.sm : tokens.radii.lg,
        borderBottomLeftRadius: mine ? tokens.radii.lg : tokens.radii.sm,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.md,
      }}
    >
      {children}
    </View>
  );
}
