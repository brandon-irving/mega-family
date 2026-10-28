// I have an invite (Screen 9 boards LoginInvite / LoginInviteHelp, canvas v33). Oct 28 layout (owner: no big
// gap): the instructions, then the paste field, an example and Continue right under them; the middle holds
// the "No link yet?" card with Hub. join/[token] does the actual redeem.
// PLACEHOLDER (scan): the LoginInvite board's "Scan QR code" card needs expo-camera in the G8 native build;
// until then the middle card is the LoginInviteHelp board's "No link yet?" help card. The board's Paste
// button needs a clipboard module (another native build); long-press paste in the field works meanwhile.
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { extractToken } from '@/features/signin/inviteToken';
import { BackButton, Heading, Pill, SignInFrame } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { Ledge } from '@/features/walkers';
import { signOut } from '@/services/auth';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { FAMILY_MEGA_DEFAULTS } from '@shared/config/looks';
import { CTA_SIZES } from '@shared/config/theme';

export default function InviteRoute() {
  const tokens = useTokens();
  const C = SIGNIN_COPY.invite;
  const [input, setInput] = useState('');
  const token = extractToken(input);
  const linked = token.length > 0;
  const go = () => linked && router.push(`/join/${token}` as never);

  return (
    <SignInFrame scene={linked ? SIGNIN_SCENES.inviteLinked : SIGNIN_SCENES.invite} testID="invite">
      {/* Back from here after Welcome's anonymous session: signing out is what returns to Welcome (the gate
          only shows it signed out). From "Join a family" (signed in with no family) it's a plain back. */}
      <BackButton onPress={() => (router.canGoBack() ? router.back() : signOut())} />
      <View style={{ marginTop: tokens.spacing.sm }}>
        <Heading title={C.title} body={C.body} />
      </View>
      <Text variant="caption" color="muted" weight="600" style={[styles.eyebrow, { marginBottom: tokens.spacing.sm }]}>
        {C.label}
      </Text>
      <Ledge id="field">
        {({ poked }) => (
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={C.placeholder}
            placeholderTextColor={tokens.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={go}
            style={{
              color: tokens.text,
              backgroundColor: tokens.surface,
              borderColor: poked ? tokens.accent : tokens.line,
              borderWidth: 1,
              borderRadius: tokens.radii.lg,
              paddingHorizontal: tokens.spacing.md,
              height: CTA_SIZES.normal.height,
              fontSize: tokens.type.body.fontSize,
            }}
            accessibilityLabel={C.label}
          />
        )}
      </Ledge>
      <Text variant="caption" color="muted" style={{ marginTop: tokens.spacing.sm }}>
        {C.example}
      </Text>
      <Ledge id="cont" pressable style={{ marginTop: tokens.spacing.lg }}>
        {({ poked, lookHere }) => (
          <Pill
            variant={linked ? 'inverse' : 'outline'}
            label={C.cont}
            disabled={!linked}
            poked={poked && linked}
            onPress={() => {
              lookHere();
              go();
            }}
          />
        )}
      </Ledge>
      <View style={[styles.divider, { marginVertical: tokens.spacing.xl, gap: tokens.spacing.md }]}>
        <View style={[styles.rule, { backgroundColor: tokens.line }]} />
        <Text variant="caption" color="muted">
          {C.or}
        </Text>
        <View style={[styles.rule, { backgroundColor: tokens.line }]} />
      </View>
      <Ledge id="help">
        <View style={[styles.help, { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, gap: tokens.spacing.sm }]}>
          <MegaSprite hex={FAMILY_MEGA_DEFAULTS.hex} sticker={FAMILY_MEGA_DEFAULTS.sticker} face="happy" scale={2} accessibilityLabel={SIGNIN_COPY.welcome.hubLabel} />
          <Text variant="title" weight="700" style={styles.center}>
            {C.helpTitle}
          </Text>
          <Text color="muted" style={styles.center}>
            {C.helpBody}
          </Text>
        </View>
      </Ledge>
    </SignInFrame>
  );
}

const styles = StyleSheet.create({
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center' },
  rule: { flex: 1, height: 1 },
  help: { alignItems: 'center', borderWidth: 1 },
  center: { textAlign: 'center' },
});
