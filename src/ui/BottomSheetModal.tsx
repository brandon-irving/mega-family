// The one bottom sheet for in-screen choices (the Store's buy sheet, a saved memory's scope). Closes four
// ways (owner, Oct 28): the ✕, a tap on the scrim, dragging the panel down, and Android back / Escape on web
// (React Native's Modal routes both to onRequestClose). Its last row stays above the home indicator.
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaPadding } from './Screen';
import { CloseButton, useDismiss, useSwipeDown } from './dismiss';
import { useTokens } from './theme';

export type BottomSheetModalProps = { open: boolean; onClose: () => void; label: string; children: ReactNode };

export function BottomSheetModal({ open, onClose, label, children }: BottomSheetModalProps) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const { padding } = useSafeAreaPadding('full');
  const { handlers, dragY } = useSwipeDown(onClose);
  // Modal already gets Android back; Escape on web is ours (react-native-web's Modal doesn't send it).
  useDismiss(onClose, { enabled: open, androidBack: false });
  const dragged = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  return (
    <Modal visible={open} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
      <Pressable testID="modal-scrim" accessibilityRole="button" accessibilityLabel={label} onPress={onClose} style={[styles.fill, { backgroundColor: tokens.scrim }]} />
      {open ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(tokens.durations.base)}
          // No accessibilityViewIsModal: the Modal is already its own window, and the scrim (a close control)
          // must stay reachable for screen readers.
          accessibilityLabel={label}
          testID="modal-panel"
          {...handlers}
          style={[
            {
              backgroundColor: tokens.surface,
              borderTopLeftRadius: tokens.radii.xl,
              borderTopRightRadius: tokens.radii.xl,
              borderTopWidth: 1,
              borderColor: tokens.line,
              paddingHorizontal: tokens.spacing.xl,
              paddingTop: tokens.spacing.sm,
              paddingBottom: (Number(padding.paddingBottom) || 0) + tokens.spacing.xl,
            },
            dragged,
          ]}
        >
          <View style={styles.top}>
            <View style={[styles.grabber, { backgroundColor: tokens.line }]} />
            <View style={styles.close}>
              <CloseButton onPress={onClose} testID="modal-close" />
            </View>
          </View>
          {children}
        </Animated.View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  grabber: { width: 40, height: 5, borderRadius: 3 },
  close: { position: 'absolute', right: -12, top: 0 },
});
