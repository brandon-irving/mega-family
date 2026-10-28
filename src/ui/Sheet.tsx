import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useDismiss } from './dismiss';
import { SafeFrame, type Presentation } from './Screen';
import { Text } from './Text';
import { useTokens } from './theme';

/** `presentation`: 'sheet' for a modal route (the default); 'tab' for a sheet-style screen in a tab's stack. */
export type SheetProps = { title: string; onClose?: () => void; presentation?: Presentation; children: ReactNode };

/**
 * The inner content of a modal sheet screen (Today, MEGA profile, member detail, …). The screen
 * itself is pushed with `presentation: 'modal'` by the router; this just gives sheets a consistent
 * header and scroll body. Owner, Oct 28: always inside the safe areas (src/ui/Screen.tsx `Presentation`).
 */
export function Sheet({ title, onClose, presentation = 'sheet', children }: SheetProps) {
  const tokens = useTokens();
  // Escape on web closes it too (a route modal: the navigator already handles Android back).
  useDismiss(onClose ?? noop, { enabled: !!onClose, androidBack: false });
  return (
    <SafeFrame presentation={presentation} testID="sheet">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: tokens.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: tokens.line,
        }}
      >
        <Text variant="title">{title}</Text>
        {onClose && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="title">✕</Text>
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>{children}</ScrollView>
    </SafeFrame>
  );
}

const noop = () => {};
