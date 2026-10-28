// A bottom sheet over a scrim (the Screen 14 boards' PlaceSheet / EventPlace; owner Oct 28: every sheet can be
// closed). Four ways out, all calling `onClose`: the visible ≥44pt Close button in the header, tapping the
// scrim, Android's back button and Escape on web (both via RN `Modal`'s `onRequestClose`). Respects the bottom
// safe area and rides above the keyboard (react-native-keyboard-controller). Reduced motion: no slide.
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import { hiddenFromA11y } from './a11y';
import { Text } from './Text';
import { useTokens } from './theme';

export type ModalSheetProps = { open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode; testID?: string };

export function ModalSheet({ open, title, closeLabel, onClose, children, testID }: ModalSheetProps) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal visible={open} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <View style={styles.fill}>
          <Pressable testID={testID ? `${testID}-scrim` : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
          <View
            testID={testID}
            accessibilityViewIsModal
            accessibilityLabel={title}
            style={{
              marginTop: 'auto',
              maxHeight: '90%',
              backgroundColor: tokens.surface,
              borderTopLeftRadius: tokens.radii.xl,
              borderTopRightRadius: tokens.radii.xl,
              borderTopWidth: 1,
              borderColor: tokens.line,
              paddingTop: tokens.spacing.sm,
              paddingBottom: insets.bottom + tokens.spacing.lg,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: tokens.line }} {...hiddenFromA11y()} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.md }}>
              <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                hitSlop={tokens.hitSlop}
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
