// Welcome (Screen 9 boards Login / LoginSheet / LoginCreate / LoginDemo, canvas v33). Oct 28 layout (owner:
// three small MEGAs meet on the wordmark and button ledges; the brand and controls form one composition. "Make my MEGA" opens the sign-in sheet on Create account, "Sign in" opens it on Sign in (Apple,
// Google, then email + password); "I have an invite" is the shared first step for kids and partners (an
// anonymous session, then src/app/invite.tsx → join/[token]). Three MEGAs stroll Hub's floor and climb the
// letters (src/features/walkers). The demo pill and sheet only render when this build opted into
// EXPO_PUBLIC_DEMO_MODE; the server's own DEMO_MODE gates `demo.signInAs` independently.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from '@/features/shell/navigation';
import { useMutation } from 'convex/react';
import { api } from '@/data/api';
import { Pill, SignInFrame, Wordmark } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { BottomSheet, DemoSheetBody, SignInSheetBody, type DEMO_KEYS, type SignInMode } from '@/features/signin/sheets';
import { Lane, Ledge } from '@/features/walkers';
import { signInAnonymously, signInWithApple, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/auth';
import { waitForConvexAuth } from '@/services/convexAuthReady';
import { demoSignIn } from '@/services/demoSignIn';
import { withSignInHold } from '@/services/signInHold';
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
  const [mode, setMode] = useState<SignInMode>('create');
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
  const open = (name: Exclude<SheetName, 'none'>, as: SignInMode = 'create') => {
    setMode(as);
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
      // Held so the gate shows the loader, not "join or start", between the two steps.
      await withSignInHold(() => demoSignIn({ signInAnonymously, waitForAuth: waitForConvexAuth, linkMember: () => signInAs({ as: key }) }));
    })();
  const onEmail = (as: SignInMode, email: string, password: string) => run('email', () => (as === 'create' ? signUpWithEmail(email, password) : signInWithEmail(email, password)))();

  const overlay = (
    <BottomSheet open={sheet !== 'none'} onClose={close} label={shown === 'demo' ? SIGNIN_COPY.demo.title : mode === 'create' ? SIGNIN_COPY.sheet.titleCreate : SIGNIN_COPY.sheet.titleSignIn}>
      {shown === 'demo' ? (
        <DemoSheetBody busy={busy} onPick={onDemo} />
      ) : (
        <SignInSheetBody busy={busy} initialMode={mode} onApple={run('apple', signInWithApple)} onGoogle={run('google', signInWithGoogle)} onEmail={onEmail} />
      )}
      {error && sheet !== 'none' ? <ErrorLine text={error} /> : null}
    </BottomSheet>
  );

  return (
    <SignInFrame scene={SIGNIN_SCENES.welcome} active={sheet === 'none'} social busy={busy === 'apple' || busy === 'google' || busy === 'email'} overlay={overlay} testID="welcome">
      {demoMode ? <DemoPill onPress={() => open('demo')} /> : null}
      <WelcomeBody onMake={() => open('signin', 'create')} onSignIn={() => open('signin', 'signin')} onInvite={onInvite} inviteBusy={busy === 'invite'} />
      {error && sheet === 'none' ? <ErrorLine text={error} /> : null}
    </SignInFrame>
  );
}

function WelcomeBody({ onMake, onSignIn, onInvite, inviteBusy }: { onMake: () => void; onSignIn: () => void; onInvite: () => void; inviteBusy: boolean }) {
  const tokens = useTokens();
  const press = (lookHere: () => void, then: () => void) => () => {
    lookHere();
    then();
  };
  // Memoized so the poked ring doesn't rebuild the brand block.
  const brand = useMemo(
    () => (
      <View testID="welcome-brand" style={styles.brand}>
        {/* Space for three small characters on the letters, without a static hero above them. */}
        <View style={{ height: 88 }} />
        <Wordmark />
        <Text color="muted" style={[styles.center, { fontSize: tokens.type.title.fontSize - 2, lineHeight: tokens.type.title.lineHeight, marginTop: tokens.spacing.lg }]}>
          {IDENTITY.tagline}
        </Text>
      </View>
    ),
    [tokens],
  );
  // G4 UX review (Oct 28): the brand block and the buttons are one composition centered together, so no dead
  // band opens between the tagline and "Make my MEGA" on a tall phone.
  return (
    <View testID="welcome-body" style={[styles.fill, styles.body]}>
      {brand}
      <Ledge id="make" pressable style={{ marginTop: tokens.spacing.xxl }}>
        {({ poked, lookHere }) => <Pill hero variant="inverse" label={SIGNIN_COPY.welcome.make} poked={poked} onPress={press(lookHere, onMake)} />}
      </Ledge>
      <Ledge id="invite" style={{ marginTop: tokens.spacing.lg }}>
        <Pill variant="outline" label={SIGNIN_COPY.welcome.invite} loading={inviteBusy} onPress={onInvite} />
      </Ledge>
      {/* The row itself (a MEGA points at it from below); the MEGAs walk in their own lane under it, never
          over its words (owner, Oct 28). */}
      <Ledge id="signinRow" style={{ marginTop: tokens.spacing.md }}>
        {({ poked, lookHere }) => (
          <View style={[styles.signinRow, { minHeight: tokens.touchTarget }]}>
            <Text color="muted">{SIGNIN_COPY.welcome.haveAccount}</Text>
            <Pressable onPress={press(lookHere, onSignIn)} accessibilityRole="button" accessibilityLabel={SIGNIN_COPY.welcome.signIn} style={{ minHeight: tokens.touchTarget, justifyContent: 'center', paddingHorizontal: tokens.spacing.sm }}>
              <Text weight="700" style={{ color: poked ? tokens.accent : tokens.text, textDecorationLine: poked ? 'underline' : 'none' }}>
                {SIGNIN_COPY.welcome.signIn}
              </Text>
            </Pressable>
          </View>
        )}
      </Ledge>
      <Lane id="signin" />
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
  body: { justifyContent: 'center' },
  brand: { alignItems: 'stretch' },
  center: { textAlign: 'center' },
  signinRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  demoPill: { position: 'absolute', right: 0, zIndex: 1, justifyContent: 'center' },
});
