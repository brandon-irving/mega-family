// The welcome screen's two sheets (Screen 9 boards LoginSheet / LoginCreate / LoginDemo): sign in (Apple,
// Google, then email + password) and, in dev builds only, the demo accounts. They slide up over a scrim
// inside the welcome screen (not a route) so the walking MEGAs can hop onto the sheet's top edge.
import { type ReactNode, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ledge } from '@/features/walkers';
import { AppleSignInButton } from '@/services/AppleSignInButton';
import { appleSignInOffIos } from '@/services/auth';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { AUTH } from '@shared/config/auth';
import { SIGNIN_COPY } from '@shared/config/copy';
import { CTA_SIZES } from '@shared/config/theme';
import { SAMPLE_FAMILY, type SampleKey } from '@shared/fixtures/sampleFamily';
import { Pill } from './parts';

/** Slides up over a scrim while `open`, and slides away when closed (Reanimated layout animations, so the
 * sheet simply mounts and unmounts with `open` and its state starts fresh each time). */
export function BottomSheet({ open, ...rest }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  return open ? <SheetPanel {...rest} /> : null;
}

function SheetPanel({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const ms = tokens.durations.slow;
  // The sheet's top only becomes a ledge once it has finished sliding up (measured in place, not mid-slide).
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(t);
  }, [ms]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(ms)} exiting={FadeOut.duration(ms)} style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={SIGNIN_COPY.sheet.close} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(ms)}
        exiting={SlideOutDown.duration(ms)}
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[
          styles.sheet,
          {
            backgroundColor: tokens.surface,
            borderColor: tokens.line,
            borderTopLeftRadius: tokens.radii.xl,
            borderTopRightRadius: tokens.radii.xl,
            paddingHorizontal: tokens.spacing.xl,
            paddingTop: tokens.spacing.sm,
            paddingBottom: insets.bottom + tokens.spacing.xl,
            gap: tokens.spacing.md,
          },
        ]}
      >
        {settled ? <Ledge id="sheet" style={[styles.ledgeMark, { left: tokens.spacing.xl, right: tokens.spacing.xl }]} /> : null}
        <View style={[styles.grabber, { backgroundColor: tokens.line, marginBottom: tokens.spacing.sm }]} />
        {children}
      </Animated.View>
    </View>
  );
}

export type SignInMode = 'signin' | 'create';
export type SignInActions = {
  onApple: () => void;
  onGoogle: () => void;
  onEmail: (mode: SignInMode, email: string, password: string) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The sign-in sheet (LoginSheet / LoginCreate boards, Oct 28): Apple and Google first (one tap), then email
 * + password. "Make my MEGA" opens it on Create account, "Sign in" on Sign in; the toggle switches. Apple:
 * Apple's own button on iOS; elsewhere only once its web flow is set up (`appleSignInOffIos`). The email
 * checks here only catch typos before a round trip — the server enforces the same rules (AUTH.email). */
export function SignInSheetBody({ busy, initialMode, onApple, onGoogle, onEmail }: { busy: string | null; initialMode: SignInMode } & SignInActions) {
  const tokens = useTokens();
  const C = SIGNIN_COPY.sheet;
  const [mode, setMode] = useState<SignInMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const create = mode === 'create';
  const appleHere = Platform.OS === 'ios' || appleSignInOffIos();

  const submit = () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) return setProblem(C.badEmail);
    if (password.length < AUTH.email.minPasswordLength) return setProblem(C.tooShort(AUTH.email.minPasswordLength));
    setProblem(null);
    onEmail(mode, trimmed, password);
  };
  const field = { color: tokens.text, backgroundColor: tokens.bg, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.lg, paddingHorizontal: tokens.spacing.md, height: CTA_SIZES.normal.height, fontSize: tokens.type.body.fontSize } as const;

  return (
    <>
      <Text variant="headline" accessibilityRole="header">
        {create ? C.titleCreate : C.titleSignIn}
      </Text>
      <View accessibilityRole="tablist" accessibilityLabel={C.tabsLabel} style={[styles.tabs, { backgroundColor: tokens.bg, borderColor: tokens.line, borderRadius: tokens.radii.pill, padding: 3, gap: 3 }]}>
        {(['signin', 'create'] as const).map((m) => {
          const on = mode === m;
          const label = m === 'create' ? C.tabCreate : C.tabSignIn;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setMode(m);
                setProblem(null);
                setForgot(false);
              }}
              style={[styles.tab, { minHeight: tokens.touchTarget - 8, borderRadius: tokens.radii.pill, backgroundColor: on ? tokens.surface : 'transparent' }]}
            >
              <Text variant="label" weight="700" color={on ? undefined : 'muted'}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {Platform.OS === 'ios' ? (
        <AppleSignInButton onPress={onApple} height={CTA_SIZES.normal.height} disabled={!!busy} />
      ) : appleHere ? (
        <Pill label={C.apple} variant="inverse" loading={busy === 'apple'} disabled={!!busy && busy !== 'apple'} onPress={onApple} />
      ) : null}
      <Pill label={C.google} variant={appleHere ? 'outline' : 'inverse'} loading={busy === 'google'} disabled={!!busy && busy !== 'google'} onPress={onGoogle} />
      <View style={[styles.row, { gap: tokens.spacing.md }]}>
        <View style={[styles.rule, { backgroundColor: tokens.line }]} />
        <Text variant="caption" color="muted">
          {C.orEmail}
        </Text>
        <View style={[styles.rule, { backgroundColor: tokens.line }]} />
      </View>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={C.email}
        placeholderTextColor={tokens.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        accessibilityLabel={C.email}
        style={field}
      />
      <View style={styles.pwWrap}>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={C.password}
          placeholderTextColor={tokens.muted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={create ? 'new-password' : 'current-password'}
          textContentType={create ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
          accessibilityLabel={C.password}
          style={[field, { paddingRight: 72 }]}
        />
        <Pressable onPress={() => setShow((v) => !v)} accessibilityRole="button" style={[styles.show, { minHeight: tokens.touchTarget, paddingHorizontal: tokens.spacing.md }]}>
          <Text variant="label" color="accent" weight="700">
            {show ? C.hide : C.show}
          </Text>
        </Pressable>
      </View>
      <Pill
        label={create ? C.submitCreate : C.submitSignIn}
        accessibilityLabel={create ? C.submitCreateLabel : C.submitSignInLabel}
        variant="inverse"
        loading={busy === 'email'}
        disabled={!!busy && busy !== 'email'}
        onPress={submit}
      />
      {problem ? (
        <Text variant="caption" color="muted" accessibilityRole="alert" style={styles.center}>
          {problem}
        </Text>
      ) : null}
      <View style={[styles.center, { minHeight: tokens.touchTarget - 12, justifyContent: 'center' }]}>
        {create ? (
          <Text variant="caption" color="muted" style={styles.center}>
            {C.rule(AUTH.email.minPasswordLength)}
          </Text>
        ) : forgot ? (
          // PLACEHOLDER: reset by email needs an email provider (AUTH.passwordResetByEmail is off).
          <Text variant="caption" color="muted" accessibilityRole="alert" style={styles.center}>
            {C.forgotSoon}
          </Text>
        ) : (
          <Pressable onPress={() => setForgot(true)} accessibilityRole="button" style={{ minHeight: tokens.touchTarget, justifyContent: 'center', paddingHorizontal: tokens.spacing.sm }}>
            <Text variant="label" color="accent" weight="700">
              {C.forgot}
            </Text>
          </Pressable>
        )}
      </View>
      <Text variant="caption" color="muted" style={styles.center}>
        {C.privacy}
      </Text>
    </>
  );
}

export const DEMO_KEYS = ['admin', 'partner', 'twin1', 'twin2'] as const satisfies readonly SampleKey[];

export function DemoSheetBody({ busy, onPick }: { busy: string | null; onPick: (key: (typeof DEMO_KEYS)[number]) => void }) {
  const tokens = useTokens();
  return (
    <>
      <View style={styles.row}>
        <Text variant="headline" accessibilityRole="header">
          {SIGNIN_COPY.demo.title}
        </Text>
        <View style={[styles.devBadge, { borderColor: tokens.line, borderRadius: tokens.radii.pill, paddingHorizontal: tokens.spacing.sm }]}>
          <Text variant="caption" color="muted">
            {SIGNIN_COPY.demo.badge}
          </Text>
        </View>
      </View>
      <View>
        {DEMO_KEYS.map((key) => {
          const member = SAMPLE_FAMILY.members.find((m) => m.key === key)!;
          const mega = SAMPLE_FAMILY.megas.find((m) => m.owner === key)!;
          return (
            <Pressable
              key={key}
              onPress={() => onPick(key)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={member.name}
              style={({ pressed }) => [styles.demoRow, { borderBottomColor: tokens.line, minHeight: tokens.touchTarget + tokens.spacing.md, gap: tokens.spacing.md, opacity: pressed || (busy && busy !== key) ? 0.6 : 1 }]}
            >
              <MegaBadge hex={mega.hex} sticker={mega.sticker} face="happy" size={32} />
              <View style={styles.fill}>
                <Text weight="700">{member.name}</Text>
                <Text variant="caption" color="muted">
                  {SIGNIN_COPY.demo.sub(mega.name, member.role)}
                </Text>
              </View>
              <Text color="muted">{busy === key ? '…' : '›'}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1 },
  ledgeMark: { position: 'absolute', left: 0, right: 0, top: 0 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  devBadge: { borderWidth: 1, borderStyle: 'dashed', height: 24, justifyContent: 'center' },
  demoRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  tabs: { flexDirection: 'row', borderWidth: 1 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rule: { flex: 1, height: 1 },
  pwWrap: { justifyContent: 'center' },
  show: { position: 'absolute', right: 4, justifyContent: 'center' },
  center: { textAlign: 'center', alignItems: 'center' },
});
