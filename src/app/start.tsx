// Join or start a family (Screen 9 board LoginFamily): shown once signed in but `me.get` has no member yet —
// most often an adult who signed in with Apple/Google and hasn't redeemed an invite. "Start a family" goes to
// the interim one-question onboarding (src/app/onboarding.tsx) until the onboarding chat replaces it in G5.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Arrow, DifferentAccount, Heading, SignInFrame } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { Ledge } from '@/features/walkers';
import { useSignedInEmail } from '@/services/auth';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';

export default function StartRoute() {
  const tokens = useTokens();
  const email = useSignedInEmail();
  return (
    <SignInFrame scene={SIGNIN_SCENES.family} testID="start">
      <View style={{ marginTop: tokens.spacing.xxl + tokens.spacing.lg }}>
        <Heading title={SIGNIN_COPY.family.title} body={SIGNIN_COPY.family.body} />
      </View>
      <View style={{ gap: tokens.spacing.xxl + tokens.spacing.lg, marginTop: tokens.spacing.xl }}>
        <ChoiceCard id="start" title={SIGNIN_COPY.family.start} body={SIGNIN_COPY.family.startBody} highlight onPress={() => router.push('/onboarding')} />
        <ChoiceCard id="join" title={SIGNIN_COPY.family.join} body={SIGNIN_COPY.family.joinBody} onPress={() => router.push('/invite')} />
      </View>
      <View style={styles.fill} />
      <DifferentAccount email={email} />
    </SignInFrame>
  );
}

function ChoiceCard({ id, title, body, highlight, onPress }: { id: string; title: string; body: string; highlight?: boolean; onPress: () => void }): ReactNode {
  const tokens = useTokens();
  return (
    <Ledge id={id} pressable>
      {({ lookHere }) => (
        <Pressable
          onPress={() => {
            lookHere();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={body}
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
          <Arrow color={highlight ? tokens.accent : tokens.muted} />
        </Pressable>
      )}
    </Ledge>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center' },
});
