// Join or start a family (Screen 9 board LoginFamily): shown once signed in but `me.get` has no member yet —
// most often an adult who signed in with Apple/Google and hasn't redeemed an invite. G5: "Start a family" calls
// `onboarding.begin` (family, admin, their default MEGA, the thread and the greeting) right here; once it
// returns, `me.get` has a member and the auth gate opens Chat, where the MEGA asks "What should I call you?"
// (the onboarding is the chat itself, canvas Screen 13). The card shows a spinner meanwhile, never a blank.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useBeginOnboarding } from '@/data/useOnboarding';
import { errorCopyFor } from '@/data/errorCopy';
import { Arrow, DifferentAccount, Heading, SignInFrame } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { Ledge } from '@/features/walkers';
import { useSignedInEmail } from '@/services/auth';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';

/** The device's timezone for the new family (IANA name). */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export default function StartRoute() {
  const tokens = useTokens();
  const email = useSignedInEmail();
  const begin = useBeginOnboarding();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      await begin({ timezone: deviceTimezone() });
      // The gate moves to the tabs on its own once me.get has the new member.
    } catch (e) {
      setError(errorCopyFor(e));
      setStarting(false);
    }
  };

  return (
    <SignInFrame scene={SIGNIN_SCENES.family} testID="start">
      <View style={{ marginTop: tokens.spacing.xxl + tokens.spacing.lg }}>
        <Heading title={SIGNIN_COPY.family.title} body={SIGNIN_COPY.family.body} />
      </View>
      <View style={{ gap: tokens.spacing.xxl + tokens.spacing.lg, marginTop: tokens.spacing.xl }}>
        <ChoiceCard id="start" title={SIGNIN_COPY.family.start} body={SIGNIN_COPY.family.startBody} highlight busy={starting} onPress={() => void onStart()} />
        <ChoiceCard id="join" title={SIGNIN_COPY.family.join} body={SIGNIN_COPY.family.joinBody} onPress={() => router.push('/invite')} />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.dangerText, marginTop: tokens.spacing.lg }}>
          {error}
        </Text>
      ) : null}
      <View style={styles.fill} />
      <DifferentAccount email={email} />
    </SignInFrame>
  );
}

function ChoiceCard({ id, title, body, highlight, busy, onPress }: { id: string; title: string; body: string; highlight?: boolean; busy?: boolean; onPress: () => void }): ReactNode {
  const tokens = useTokens();
  return (
    <Ledge id={id} pressable>
      {({ lookHere }) => (
        <Pressable
          onPress={() => {
            lookHere();
            onPress();
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={body}
          accessibilityState={{ busy: !!busy, disabled: !!busy }}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: tokens.surface,
              borderColor: highlight ? tokens.accent : tokens.line,
              borderWidth: highlight ? 2 : 1,
              borderRadius: tokens.radii.xl,
              paddingHorizontal: tokens.spacing.xl,
              minHeight: tokens.touchTarget * 3,
              gap: tokens.spacing.lg,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.fill, { gap: tokens.spacing.xs }]}>
            <Text variant="title">{title}</Text>
            <Text color="muted">{body}</Text>
          </View>
          {busy ? <ActivityIndicator color={tokens.accent} testID={`${id}-busy`} /> : <Arrow color={highlight ? tokens.accent : tokens.muted} />}
        </Pressable>
      )}
    </Ledge>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center' },
});
