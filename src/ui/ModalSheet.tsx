// The one bottom sheet over a scrim (Screen 14's PlaceSheet / EventPlace, the Store's buy sheet, a saved
// memory's scope). Owner, Oct 28: every sheet can be closed, five ways, all calling `onClose`: the visible
// ≥44pt ✕ in the header, tapping the scrim, dragging the panel down (src/ui/dismiss useSwipeDown), Android's
// back button and Escape on web (both through RN `Modal`'s `onRequestClose`). Respects the bottom safe area
// and rides above the keyboard (react-native-keyboard-controller). Reduced motion: no slide.
// `showTitle={false}` when the content brings its own big headline (the Store); the title still labels it.
import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SHEET_LAYOUT } from '@shared/config/theme';
import { hiddenFromA11y } from './a11y';
import { CloseButton, useDismiss, useSwipeDown } from './dismiss';
import { useSafeAreaPadding } from './Screen';
import { Text } from './Text';
import { useTokens } from './theme';

const noop = () => {};
// Web modals use a portal; a nested native-style provider can measure that portal as an inset.
const ModalSafeArea = Platform.OS === 'web' ? View : SafeAreaProvider;

export type ModalSheetProps = { open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode; showTitle?: boolean; testID?: string };

export function ModalSheet({ open, title, closeLabel, onClose, children, showTitle = true, testID }: ModalSheetProps) {
  const reduced = useReducedMotion();
  useDismiss(noop, { enabled: open, androidBack: false, layer: 'overlay' });
  return (
    <Modal visible={open} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      {/* Measure the modal window, not the presenting tab's bottom-bar inset. */}
      <ModalSafeArea style={styles.fill}>
        <ModalSheetBody title={title} closeLabel={closeLabel} onClose={onClose} showTitle={showTitle} testID={testID}>{children}</ModalSheetBody>
      </ModalSafeArea>
    </Modal>
  );
}

function ModalSheetBody({ title, closeLabel, onClose, children, showTitle, testID }: Omit<ModalSheetProps, 'open'>) {
  const tokens = useTokens();
  const bottomInset = Number(useSafeAreaPadding('full').padding.paddingBottom) || 0;
  const { handlers, dragY } = useSwipeDown(onClose);
  const dragged = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <View style={styles.fill}>
        {/* A tap target only: screen readers get the one ✕ (G4 UX review: two "Close" buttons otherwise). */}
        <Pressable testID={testID ? `${testID}-scrim` : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]} onPress={onClose} accessible={false} {...hiddenFromA11y()} />
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[
            {
              marginTop: 'auto',
              maxHeight: SHEET_LAYOUT.maxHeight,
              backgroundColor: tokens.surface,
              borderTopLeftRadius: tokens.radii.xl,
              borderTopRightRadius: tokens.radii.xl,
              borderTopWidth: 1,
              borderColor: tokens.line,
              paddingTop: tokens.spacing.sm,
            },
            dragged,
          ]}
        >
          <View {...handlers} style={{ flexShrink: 0, alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: tokens.line }} {...hiddenFromA11y()} />
          <View testID={testID ? `${testID}-header` : undefined} {...handlers} style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.md }}>
            {showTitle ? (
              <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                {title}
              </Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <CloseButton onPress={onClose} label={closeLabel} variant="filled" testID={testID ? `${testID}-close` : undefined} />
          </View>
          <ScrollView
            testID={testID ? `${testID}-scroll` : undefined}
            style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }}
            keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
            contentContainerStyle={{ padding: tokens.spacing.lg, paddingBottom: bottomInset + tokens.spacing.lg, gap: tokens.spacing.md }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
