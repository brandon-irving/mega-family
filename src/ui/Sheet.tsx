import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTokens } from './theme';

export type SheetProps = { title: string; onClose?: () => void; children: ReactNode };

/**
 * The inner content of a modal sheet screen (Today, MEGA profile, member detail, …). The screen
 * itself is pushed with `presentation: 'modal'` by the router; this just gives sheets a consistent
 * header and scroll body. Owner, Oct 28: always inside the safe areas — the native SafeAreaView pads only
 * where this view actually meets the status bar / notch / home indicator, so an iOS page-sheet modal (which
 * already starts below the status bar) gets no extra top gap, while a full-screen sheet (web, Android, a
 * tab's stack) does.
 */
export function Sheet({ title, onClose, children }: SheetProps) {
  const tokens = useTokens();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={['top', 'bottom', 'left', 'right']} testID="sheet">
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
    </SafeAreaView>
  );
}
