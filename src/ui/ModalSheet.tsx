// The one bottom sheet over a scrim (Screen 14's PlaceSheet / EventPlace, the Store's buy sheet, a saved
// memory's scope). Owner, Oct 28: every sheet can be closed, five ways, all calling `onClose`: the visible
// ≥44pt ✕ in the header, tapping the scrim, dragging the panel down (src/ui/dismiss useSwipeDown), Android's
// back button and Escape on web (both through RN `Modal`'s `onRequestClose`). Respects the bottom safe area
// and rides above the keyboard (react-native-keyboard-controller). Reduced motion: no slide.
// `showTitle={false}` when the content brings its own big headline (the Store); the title still labels it.
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { Path, Svg } from 'react-native-svg';
import { hiddenFromA11y } from './a11y';
import { useDismiss, useSwipeDown } from './dismiss';
import { useSafeAreaPadding } from './Screen';
import { Text } from './Text';
import { useTokens } from './theme';

const noop = () => {};

export type ModalSheetProps = { open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode; showTitle?: boolean; testID?: string };

export function ModalSheet({ open, title, closeLabel, onClose, children, showTitle = true, testID }: ModalSheetProps) {
  const tokens = useTokens();
  const bottomInset = Number(useSafeAreaPadding('full').padding.paddingBottom) || 0;
  const reduced = useReducedMotion();
  const { handlers, dragY } = useSwipeDown(onClose);
  const dragged = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  // While open it's the top Escape layer, so the screen under it doesn't close too; the Modal's own
  // onRequestClose (Escape on web, back on Android) is what closes it.
  useDismiss(noop, { enabled: open, androidBack: false, layer: 'overlay' });
  return (
    <Modal visible={open} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <View style={styles.fill}>
          {/* A tap target only: screen readers get the one ✕ (G4 UX review: two "Close" buttons otherwise). */}
          <Pressable testID={testID ? `${testID}-scrim` : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]} onPress={onClose} accessible={false} {...hiddenFromA11y()} />
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            accessibilityLabel={title}
            {...handlers}
            style={[
              {
                marginTop: 'auto',
                maxHeight: '90%',
                backgroundColor: tokens.surface,
                borderTopLeftRadius: tokens.radii.xl,
                borderTopRightRadius: tokens.radii.xl,
                borderTopWidth: 1,
                borderColor: tokens.line,
                paddingTop: tokens.spacing.sm,
                paddingBottom: bottomInset + tokens.spacing.lg,
              },
              dragged,
            ]}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: tokens.line }} {...hiddenFromA11y()} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.md }}>
              {showTitle ? (
                <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                  {title}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                hitSlop={tokens.hitSlop}
                testID={testID ? `${testID}-close` : undefined}
                style={{ width: tokens.touchTarget, height: tokens.touchTarget, borderRadius: tokens.touchTarget / 2, backgroundColor: tokens.line, alignItems: 'center', justifyContent: 'center' }}
              >
                <View {...hiddenFromA11y()}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <Path d="M6 6l12 12M18 6 6 18" stroke={tokens.text} strokeWidth={2.2} strokeLinecap="round" />
                  </Svg>
                </View>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
