// Small pieces the sign-in screens share (Screen 9 boards): the wordmark, the pill buttons, the back
// button, the "Use a different account" link and the full-screen frame with the walking MEGAs.
import { type ReactNode, useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useIsFocused } from 'expo-router';
import { SafeFrame, type Presentation } from '@/ui/Screen';
import { Path, Svg } from 'react-native-svg';
import { Ledge, WalkerStage, type Scene } from '@/features/walkers';
import { useWalkerLayout } from '@/features/walkers/WalkerStage';
import { NoContentRegistry } from '@/ui/contentRegistry';
import { hiddenFromA11y } from '@/ui/a11y';
import { signOut } from '@/services/auth';
import { Button, type ButtonProps } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { IDENTITY } from '@shared/config/identity';
import { CTA_SIZES, WORDMARK } from '@shared/config/theme';

/** A sign-in screen: the Midnight background edge to edge, safe-area padding, and the walking MEGAs.
 * `presentation` (src/ui/Screen.tsx): 'full' for Welcome and Start, 'sheet' for the invite and join modals. */
export function SignInFrame({ scene, busy, children, overlay, active = true, social = false, presentation = 'full', testID }: { scene: Scene; busy?: boolean; children: ReactNode; overlay?: ReactNode; active?: boolean; social?: boolean; presentation?: Presentation; testID?: string }) {
  const tokens = useTokens();
  const focused = useIsFocused();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return (
    <View style={[styles.fill, { backgroundColor: tokens.bg }]} testID={testID}>
      <WalkerStage scene={scene} busy={busy} overlay={overlay} active={active && focused && !keyboardVisible} social={social}>
        <View style={styles.fill} {...hiddenFromA11y(!active)}>
        <SafeFrame presentation={presentation} testID={testID ? `${testID}-safe` : undefined}>
          <KeyboardAvoidingView behavior="padding" style={styles.fill}>
            <SignInScroll>{children}</SignInScroll>
          </KeyboardAvoidingView>
        </SafeFrame>
        </View>
      </WalkerStage>
    </View>
  );
}

function SignInScroll({ children }: { children: ReactNode }) {
  const tokens = useTokens();
  const measure = useWalkerLayout();
  return <ScrollView keyboardDismissMode="on-drag" style={styles.fill} keyboardShouldPersistTaps="handled" onScroll={measure} onLayout={measure} scrollEventThrottle={32} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: tokens.spacing.xl, paddingBottom: tokens.spacing.lg }}>{children}</ScrollView>;
}

/** "MEGA" in large letters (owner, Oct 27). The walking MEGAs stand on the tops of its capitals. */
export function Wordmark() {
  return (
    // Its content rect starts at the capitals (contentTop), so a MEGA standing on them covers nothing; the
    // Text itself doesn't register its taller line box.
    <Ledge id="head" inset={WORDMARK.fontSize * WORDMARK.capTop} contentTop={WORDMARK.fontSize * WORDMARK.capTop}>
      <NoContentRegistry>
      <Text
        accessibilityRole="header"
        style={{ fontSize: WORDMARK.fontSize, lineHeight: WORDMARK.lineHeight, fontWeight: WORDMARK.fontWeight, letterSpacing: WORDMARK.fontSize * WORDMARK.letterSpacingEm, textAlign: 'center' }}
      >
        {IDENTITY.name}
      </Text>
      </NoContentRegistry>
    </Ledge>
  );
}

/** A full-width pill button. `poked`: a walking MEGA is pointing at it (the boards' accent ring). */
export function Pill({ hero, poked, ...props }: ButtonProps & { hero?: boolean; poked?: boolean }) {
  const tokens = useTokens();
  return (
    <View style={[styles.ring, { borderColor: poked ? tokens.accent : 'transparent', borderRadius: tokens.radii.pill }]}>
      <Button pill size={hero ? CTA_SIZES.hero : CTA_SIZES.normal} {...props} />
    </View>
  );
}

/** A headline + one muted line, top-left (the invite, join and family boards). */
export function Heading({ title, body }: { title: string; body?: string }) {
  const tokens = useTokens();
  return (
    <View style={{ gap: tokens.spacing.sm, marginBottom: tokens.spacing.xl }}>
      <Text variant="display" accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text color="muted">{body}</Text> : null}
    </View>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function Arrow({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={SIGNIN_COPY.invite.back}
      hitSlop={tokens.hitSlop}
      style={{ width: tokens.touchTarget, height: tokens.touchTarget, marginLeft: -tokens.spacing.md, alignItems: 'center', justifyContent: 'center' }}
    >
      <Chevron color={tokens.text} />
    </Pressable>
  );
}

/** "Not you? Use a different account" — signed in but not in a family must never be a dead end (Oct 26). */
export function DifferentAccount({ email }: { email?: string | null }) {
  const tokens = useTokens();
  return (
    <View style={{ alignItems: 'center' }}>
      {email ? (
        <Text variant="caption" color="muted">
          {email}
        </Text>
      ) : null}
      <Pressable onPress={() => signOut()} accessibilityRole="button" accessibilityLabel={SIGNIN_COPY.differentAccount.action} style={{ minHeight: tokens.touchTarget, justifyContent: 'center', paddingHorizontal: tokens.spacing.sm }}>
        <Text color="muted">
          {SIGNIN_COPY.differentAccount.prompt}{' '}
          <Text color="accent" weight="700">
            {SIGNIN_COPY.differentAccount.action}
          </Text>
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ring: { borderWidth: 2, padding: 2, margin: -4 },
});
