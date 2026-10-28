// Welcome (Screen 9 boards Login / LoginSheet / LoginDemo, approved Oct 26; wordmark and the one tagline Oct
// 27). "MEGA" in large letters, the tagline, then "Make my MEGA" and "Sign in" (both open the sign-in sheet:
// Apple on iOS, Google everywhere) and "I have an invite" (the shared first step for kids and partners: an
// anonymous session, then src/app/invite.tsx → join/[token]). Three MEGAs walk on the screen
// (src/features/walkers). The demo pill and sheet only render when this build opted into
// EXPO_PUBLIC_DEMO_MODE; the server's own DEMO_MODE gates `demo.signInAs` independently.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/data/api';
import { Pill, SignInFrame, Wordmark } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { BottomSheet, DemoSheetBody, SignInSheetBody, type DEMO_KEYS } from '@/features/signin/sheets';
import { Ledge } from '@/features/walkers';
import { signInAnonymously, signInWithApple, signInWithGoogle } from '@/services/auth';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { IDENTITY } from '@shared/config/identity';

type SheetName = 'none' | 'signin' | 'demo';

/** `demoMode` defaults to the env flag; it's a prop (not read straight from `process.env` in the body)
 * so WelcomeRoute.test.tsx can render both states without fighting Metro/babel's static env inlining. */
export default function WelcomeRoute({ demoMode = process.env.EXPO_PUBLIC_DEMO_MODE === 'true' }: { demoMode?: boolean } = {}) {
  const signInAs = useMutation(api.demo.signInAs);
  const [sheet, setSheet] = useState<SheetName>('none');
  // The last sheet opened stays rendered while it slides away.
  const [shown, setShown] = useState<Exclude<SheetName, 'none'>>('signin');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (key: string, action: () => Promise<void>) => async () => {
    setError(null);
    setBusy(key);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : SIGNIN_COPY.failed);
    } finally {
      setBusy(null);
    }
  };
  const open = (name: Exclude<SheetName, 'none'>) => {
    setShown(name);
    setSheet(name);
  };
  const close = () => {
    if (!busy) setSheet('none');
  };

  const onInvite = run('invite', async () => {
    await signInAnonymously();
    router.push('/invite');
  });
  const onDemo = (key: (typeof DEMO_KEYS)[number]) =>
    run(key, async () => {
      await signInAnonymously();
      await signInAs({ as: key });
    })();

  const scene = sheet === 'none' ? SIGNIN_SCENES.welcome : SIGNIN_SCENES.welcomeSheet;
  const overlay = (
    <BottomSheet open={sheet !== 'none'} onClose={close} label={shown === 'demo' ? SIGNIN_COPY.demo.title : SIGNIN_COPY.sheet.title}>
      {shown === 'demo' ? (
        <DemoSheetBody busy={busy} onPick={onDemo} />
      ) : (
        <SignInSheetBody busy={busy} onApple={run('apple', signInWithApple)} onGoogle={run('google', signInWithGoogle)} />
      )}
      {error && sheet !== 'none' ? <ErrorLine text={error} /> : null}
    </BottomSheet>
  );

  return (
    <SignInFrame scene={scene} busy={busy === 'apple' || busy === 'google'} overlay={overlay} testID="welcome">
      {demoMode ? <DemoPill onPress={() => open('demo')} /> : null}
      <WelcomeBody onMake={() => open('signin')} onInvite={onInvite} inviteBusy={busy === 'invite'} />
      {error && sheet === 'none' ? <ErrorLine text={error} /> : null}
    </SignInFrame>
  );
}

function WelcomeBody({ onMake, onInvite, inviteBusy }: { onMake: () => void; onInvite: () => void; inviteBusy: boolean }) {
  const tokens = useTokens();
  const press = (lookHere: () => void, then: () => void) => () => {
    lookHere();
    then();
  };
  // Memoized so the poked ring doesn't rebuild the rest of the column.
  const rest = useMemo(
    () => (
      <>
        <View style={styles.fill} />
        {/* The empty "floor" the MEGAs stroll along above the wordmark (the board's y 360). */}
        <Ledge id="floor" style={{ marginBottom: tokens.spacing.xxl + tokens.spacing.sm }} />
        <Wordmark />
        <Text color="muted" style={[styles.center, { fontSize: tokens.type.title.fontSize - 2, lineHeight: tokens.type.title.lineHeight, marginTop: tokens.spacing.lg }]}>
          {IDENTITY.tagline}
        </Text>
        <View style={{ height: tokens.spacing.xxl * 2 + tokens.spacing.lg }} />
      </>
    ),
    [tokens],
  );
  return (
    <View style={styles.fill}>
      {rest}
      <Ledge id="make" pressable>
        {({ poked, lookHere }) => <Pill hero variant="inverse" label={SIGNIN_COPY.welcome.make} poked={poked} onPress={press(lookHere, onMake)} />}
      </Ledge>
      <Ledge id="invite" style={{ marginTop: tokens.spacing.lg }}>
        <Pill variant="outline" label={SIGNIN_COPY.welcome.invite} loading={inviteBusy} onPress={onInvite} />
      </Ledge>
      {/* The MEGAs walk along just under the "Sign in" row (the board's y 794). */}
      <Ledge id="signin" inset={tokens.touchTarget} style={{ marginTop: tokens.spacing.lg }}>
        {({ poked, lookHere }) => (
          <View style={[styles.signinRow, { minHeight: tokens.touchTarget }]}>
            <Text color="muted">{SIGNIN_COPY.welcome.haveAccount}</Text>
            <Pressable onPress={press(lookHere, onMake)} accessibilityRole="button" accessibilityLabel={SIGNIN_COPY.welcome.signIn} style={{ minHeight: tokens.touchTarget, justifyContent: 'center', paddingHorizontal: tokens.spacing.sm }}>
              <Text weight="700" style={{ color: poked ? tokens.accent : tokens.text, textDecorationLine: poked ? 'underline' : 'none' }}>
                {SIGNIN_COPY.welcome.signIn}
              </Text>
            </Pressable>
          </View>
        )}
      </Ledge>
    </View>
  );
}

function DemoPill({ onPress }: { onPress: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={SIGNIN_COPY.demo.title} style={[styles.demoPill, { minHeight: tokens.touchTarget, top: tokens.spacing.sm, right: tokens.spacing.md }]}>
      <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: tokens.line, borderRadius: tokens.radii.pill, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs }}>
        <Text variant="caption" color="muted" weight="600">
          {SIGNIN_COPY.welcome.demo}
        </Text>
      </View>
    </Pressable>
  );
}

function ErrorLine({ text }: { text: string }) {
  const tokens = useTokens();
  return (
    <Text color="muted" accessibilityRole="alert" style={[styles.center, { marginTop: tokens.spacing.sm }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  signinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  demoPill: { position: 'absolute', right: 0, zIndex: 1, justifyContent: 'center' },
});
