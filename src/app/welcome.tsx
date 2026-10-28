// Welcome (Screen 9 boards Login / LoginSheet / LoginCreate / LoginDemo, canvas v33). Oct 28 layout (owner:
// no empty band above MEGA): Hub, the family's MEGA, stands in a soft spotlight above the "MEGA" wordmark and
// the one tagline, and that brand block is centered in the space above the buttons, which sit in the thumb
// zone. "Make my MEGA" opens the sign-in sheet on Create account, "Sign in" opens it on Sign in (Apple,
// Google, then email + password); "I have an invite" is the shared first step for kids and partners (an
// anonymous session, then src/app/invite.tsx → join/[token]). Three MEGAs stroll Hub's floor and climb the
// letters (src/features/walkers). The demo pill and sheet only render when this build opted into
// EXPO_PUBLIC_DEMO_MODE; the server's own DEMO_MODE gates `demo.signInAs` independently.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Defs, Ellipse, RadialGradient, Stop, Svg } from 'react-native-svg';
import { api } from '@/data/api';
import { Pill, SignInFrame, Wordmark } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { BottomSheet, DemoSheetBody, SignInSheetBody, type DEMO_KEYS, type SignInMode } from '@/features/signin/sheets';
import { Ledge } from '@/features/walkers';
import { signInAnonymously, signInWithApple, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/auth';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { AUTH } from '@shared/config/auth';
import { SIGNIN_COPY } from '@shared/config/copy';
import { IDENTITY } from '@shared/config/identity';
import { FAMILY_MEGA_DEFAULTS } from '@shared/config/looks';

type SheetName = 'none' | 'signin' | 'demo';

/** The welcome board's Hub: 4x the 32x40 sprite, in a spotlight 300x190 with a floor shadow 250x12. */
const HUB = { scale: 4, w: 128, h: 160, light: { w: 300, h: 190, opacity: 0.18 }, shadow: { w: 250, h: 12, opacity: 0.5 } };

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
      await signInAnonymously();
      await withFreshSession(() => signInAs({ as: key }));
    })();
  const onEmail = (as: SignInMode, email: string, password: string) => run('email', () => (as === 'create' ? signUpWithEmail(email, password) : signInWithEmail(email, password)))();

  const scene = sheet === 'none' ? SIGNIN_SCENES.welcome : SIGNIN_SCENES.welcomeSheet;
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
    <SignInFrame scene={scene} busy={busy === 'apple' || busy === 'google' || busy === 'email'} overlay={overlay} testID="welcome">
      {demoMode ? <DemoPill onPress={() => open('demo')} /> : null}
      <WelcomeBody onMake={() => open('signin', 'create')} onSignIn={() => open('signin', 'signin')} onInvite={onInvite} inviteBusy={busy === 'invite'} />
      {error && sheet === 'none' ? <ErrorLine text={error} /> : null}
    </SignInFrame>
  );
}

/** Right after an anonymous sign-in, the Convex client can still be sending the old (or no) token, so the
 * first call may come back UNAUTHENTICATED; retry it a few times (AUTH.freshSessionRetry). */
async function withFreshSession<T>(call: () => Promise<T>): Promise<T> {
  const { attempts, delayMs } = AUTH.freshSessionRetry;
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (e) {
      const code = e instanceof ConvexError ? (e.data as { code?: string } | undefined)?.code : undefined;
      if (code !== 'UNAUTHENTICATED' || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** Hub in its spotlight, standing on the floor ledge the walking MEGAs stroll along. */
function HubSpot() {
  const tokens = useTokens();
  const { light, shadow } = HUB;
  return (
    <View style={[styles.hubSpot, { height: light.h }]}>
      <Svg width={light.w} height={light.h} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="spot" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={FAMILY_MEGA_DEFAULTS.hex} stopOpacity={light.opacity} />
            <Stop offset="1" stopColor={FAMILY_MEGA_DEFAULTS.hex} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="floorShadow" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={tokens.scrim} stopOpacity={shadow.opacity} />
            <Stop offset="1" stopColor={tokens.scrim} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={light.w / 2} cy={light.h / 2} rx={light.w / 2} ry={light.h / 2} fill="url(#spot)" />
        <Ellipse cx={light.w / 2} cy={light.h - shadow.h / 2 - (light.h - HUB.h) / 2} rx={shadow.w / 2} ry={shadow.h / 2} fill="url(#floorShadow)" />
      </Svg>
      <MegaSprite hex={FAMILY_MEGA_DEFAULTS.hex} sticker={FAMILY_MEGA_DEFAULTS.sticker} face="happy" scale={HUB.scale} accessibilityLabel={SIGNIN_COPY.welcome.hubLabel} />
    </View>
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
      <View style={[styles.fill, styles.brand]}>
        <HubSpot />
        {/* Hub's floor: the walking MEGAs stroll along it, past Hub's feet. */}
        <Ledge id="floor" style={[styles.floor, { marginTop: -(HUB.light.h - HUB.h) / 2 }]} />
        <View style={{ height: tokens.spacing.xl + tokens.spacing.xs }} />
        <Wordmark />
        <Text color="muted" style={[styles.center, { fontSize: tokens.type.title.fontSize - 2, lineHeight: tokens.type.title.lineHeight, marginTop: tokens.spacing.lg }]}>
          {IDENTITY.tagline}
        </Text>
      </View>
    ),
    [tokens],
  );
  return (
    <View style={styles.fill}>
      {brand}
      <Ledge id="make" pressable style={{ marginTop: tokens.spacing.xl }}>
        {({ poked, lookHere }) => <Pill hero variant="inverse" label={SIGNIN_COPY.welcome.make} poked={poked} onPress={press(lookHere, onMake)} />}
      </Ledge>
      <Ledge id="invite" style={{ marginTop: tokens.spacing.lg }}>
        <Pill variant="outline" label={SIGNIN_COPY.welcome.invite} loading={inviteBusy} onPress={onInvite} />
      </Ledge>
      {/* The MEGAs walk along just under the "Sign in" row (the board's y 806). */}
      <Ledge id="signin" inset={tokens.touchTarget} style={{ marginTop: tokens.spacing.md }}>
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
  brand: { justifyContent: 'center' },
  hubSpot: { alignSelf: 'center', width: HUB.light.w, alignItems: 'center', justifyContent: 'center' },
  floor: { alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  signinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  demoPill: { position: 'absolute', right: 0, zIndex: 1, justifyContent: 'center' },
});
