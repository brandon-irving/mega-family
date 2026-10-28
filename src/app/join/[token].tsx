// mega://join/<token> — redeem an invite (Screen 9 boards LoginPreview / LoginPreviewKid / LoginLocked).
// PLACEHOLDER (preview): the boards' card names who invited you and shows the family's MEGAs, which needs an
// invite-preview query the contract doesn't have yet; until then the card is the generic "You're invited"
// with Hub. Kids type the 5-digit parent code here (the KidCode board's keypad comes with onboarding, G5);
// five wrong codes lock the invite (RATE_LIMITED) and the locked board shows.
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@/data/api';
import { errorCopyFor } from '@/data/errorCopy';
import { BackButton, DifferentAccount, Pill, SignInFrame } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { Ledge } from '@/features/walkers';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { FAMILY_MEGA_DEFAULTS } from '@shared/config/looks';
import { CTA_SIZES } from '@shared/config/theme';
import type { ErrorCode } from '@shared/domain/enums';

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: ErrorCode } | undefined)?.code : undefined);

export default function JoinRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const tokens = useTokens();
  // CONTRACT.md v0.5: invites.redeem is an action, not a mutation (the wrong-parent-code attempt counter
  // has to commit even when this call itself still fails).
  const redeem = useAction(api.invites.redeem);
  const [parentCode, setParentCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/invite'));
  const onJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      await redeem({ token, parentCode: parentCode || undefined });
      router.replace('/chat' as never);
    } catch (e) {
      if (codeOf(e) === 'RATE_LIMITED') setLocked(true);
      else setError(errorCopyFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    return (
      <SignInFrame scene={SIGNIN_SCENES.locked} testID="join-locked">
        <View style={styles.fill} />
        <Ledge id="lock">
          <View style={{ gap: tokens.spacing.md }}>
            <Text variant="display" accessibilityRole="header" style={styles.center}>
              {SIGNIN_COPY.locked.title}
            </Text>
            <Text variant="title" color="muted" weight="400" style={styles.center}>
              {SIGNIN_COPY.locked.body}
            </Text>
          </View>
        </Ledge>
        <View style={styles.fill} />
        <Pill hero variant="inverse" label={SIGNIN_COPY.locked.action} onPress={() => router.replace('/invite')} />
      </SignInFrame>
    );
  }

  return (
    <SignInFrame scene={SIGNIN_SCENES.join} busy={busy} testID="join">
      <BackButton onPress={back} />
      <Ledge id="card" style={{ marginTop: tokens.spacing.xxl }}>
        <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, gap: tokens.spacing.xs }]}>
          <View style={{ marginBottom: tokens.spacing.sm }}>
            <MegaSprite hex={FAMILY_MEGA_DEFAULTS.hex} sticker={FAMILY_MEGA_DEFAULTS.sticker} face="calm" scale={3} accessibilityLabel={FAMILY_MEGA_DEFAULTS.name} />
          </View>
          <Text variant="caption" color="muted" weight="600" style={styles.eyebrow}>
            {SIGNIN_COPY.join.eyebrow}
          </Text>
          <Text variant="headline" accessibilityRole="header" style={styles.center}>
            {SIGNIN_COPY.join.title}
          </Text>
          <Text color="muted" style={styles.center}>
            {SIGNIN_COPY.join.body}
          </Text>
        </View>
      </Ledge>
      <View style={styles.fill} />
      <Text color="muted" style={{ marginBottom: tokens.spacing.sm }}>
        {SIGNIN_COPY.join.kidHint}
      </Text>
      <TextInput
        value={parentCode}
        onChangeText={(t) => setParentCode(t.replace(/\D/g, '').slice(0, 5))}
        placeholder={SIGNIN_COPY.join.codePlaceholder}
        placeholderTextColor={tokens.muted}
        keyboardType="number-pad"
        maxLength={5}
        style={{
          color: tokens.text,
          backgroundColor: tokens.surface,
          borderColor: tokens.line,
          borderWidth: 1,
          borderRadius: tokens.radii.lg,
          paddingHorizontal: tokens.spacing.md,
          height: CTA_SIZES.normal.height,
          fontSize: tokens.type.body.fontSize,
          letterSpacing: parentCode ? 4 : 0,
        }}
        accessibilityLabel={SIGNIN_COPY.join.codeLabel}
      />
      {error ? (
        <Text color="muted" accessibilityRole="alert" style={{ marginTop: tokens.spacing.sm }}>
          {error}
        </Text>
      ) : null}
      <View style={{ marginTop: tokens.spacing.lg }}>
        <Pill hero variant="inverse" label={SIGNIN_COPY.join.action} loading={busy} onPress={onJoin} />
      </View>
      <View style={{ marginTop: tokens.spacing.sm }}>
        <DifferentAccount />
      </View>
    </SignInFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { alignItems: 'center', borderWidth: 1 },
});
