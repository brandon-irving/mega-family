import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useDismiss } from './dismiss';
import { SafeFrame, type Presentation } from './Screen';
import { Text } from './Text';
import { useTokens } from './theme';

/** `presentation`: 'sheet' for a modal route (the default); 'tab' for a sheet-style screen in a tab's stack. */
export type SheetProps = { title: string; onClose?: () => void; presentation?: Presentation; children: ReactNode; scroll?: boolean };

/**
 * The inner content of a modal sheet screen (Today, MEGA profile, member detail, …). The screen
 * itself is pushed with `presentation: 'modal'` by the router; this just gives sheets a consistent
 * header and scroll body. Owner, Oct 28: always inside the safe areas (src/ui/Screen.tsx `Presentation`).
 */
export function Sheet({ title, onClose, presentation = 'sheet', children, scroll = true }: SheetProps) {
  const tokens = useTokens();
  // Escape on web closes it too (a route modal: the navigator already handles Android back).
  useDismiss(onClose ?? noop, { enabled: !!onClose, androidBack: false });
  return (
    <SafeFrame presentation={presentation} testID="sheet">
      {/* G6 polish fix: wide desktop web ran a sheet's content edge-to-edge (the Invite/QR panel showed
          content pinned to one side with dead space beside it) — same tokens.layout.contentMaxWidth
          centered column as src/ui/Screen.tsx, applied once here so every sheet benefits. */}
      <View style={styles.center}>
        <View testID="sheet-content" style={[styles.fill, { width: '100%', maxWidth: tokens.layout.contentMaxWidth }]}>
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
            <Text variant="label" style={{ flex: 1, fontSize: 18, lineHeight: 24 }} accessibilityRole="header">{title}</Text>
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
          {scroll ? <ScrollView contentInsetAdjustmentBehavior="never" keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>{children}</ScrollView> : <View style={styles.fill}>{children}</View>}
        </View>
      </View>
    </SafeFrame>
  );
}

const noop = () => {};

const styles = StyleSheet.create({ fill: { flex: 1 }, center: { flex: 1, alignItems: 'center' } });
