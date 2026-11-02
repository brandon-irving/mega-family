import { messageBubbleColors, USER_BUBBLE } from '@shared/config/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTokens } from './theme';

export type BubbleProps = { children: ReactNode; mine?: boolean; accent?: string };

/** Shared treatment for both sides of a conversation. */
export function Bubble({ children, mine = true, accent }: BubbleProps) {
  const tokens = useTokens();
  return (
    <View
      testID="bubble"
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        // The message column (MessageRow) holds the 82% limit; a percentage here would resolve against a
        // parent with no width of its own and squeeze short labels to one word per line.
        maxWidth: '100%',
        backgroundColor: mine ? USER_BUBBLE.background : accent ? messageBubbleColors(accent, 'assistant').background : tokens.surface,
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
