// The welcome screen's two sheets (Screen 9 boards LoginSheet / LoginDemo): sign in (Apple on iOS, Google)
// and, in dev builds only, the demo accounts. They slide up over a scrim inside the welcome screen (not a
// route) so the walking MEGAs can hop onto the sheet's top edge.
import { type ReactNode, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ledge } from '@/features/walkers';
import { AppleSignInButton } from '@/services/AppleSignInButton';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
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

/** Off iOS, Google is the only option, so it gets the filled button (the LoginSheet board's Android/web
 * state); on iOS it sits under Apple's own button as the outlined one. */
export function SignInSheetBody({ busy, onApple, onGoogle }: { busy: string | null; onApple: () => void; onGoogle: () => void }) {
  const tokens = useTokens();
  return (
    <>
      <Text variant="headline" accessibilityRole="header" style={{ marginBottom: tokens.spacing.xs }}>
        {SIGNIN_COPY.sheet.title}
      </Text>
      <AppleSignInButton onPress={onApple} height={CTA_SIZES.normal.height} disabled={!!busy} />
      <Pill label={SIGNIN_COPY.sheet.google} variant={Platform.OS === 'ios' ? 'outline' : 'inverse'} loading={busy === 'google'} disabled={!!busy && busy !== 'google'} onPress={onGoogle} />
      <Text variant="caption" color="muted" style={{ textAlign: 'center', marginTop: tokens.spacing.xs }}>
        {SIGNIN_COPY.sheet.privacy}
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
});
