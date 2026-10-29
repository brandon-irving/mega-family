// I have an invite (Screen 9 boards LoginInvite / LoginInviteHelp, canvas v33; G8 Screen 17 PasteNothing /
// PasteNotInvite, canvas v41). Oct 28 layout (owner: no big gap): the instructions, then the paste field with
// its Paste button, an example (or the paste feedback in its place) and Continue right under them; the middle
// holds the "Scan QR code" card on the phone (G8, expo-camera; `/scan`) or, on the web where there's no
// scanner (G8 decision 6), the LoginInviteHelp board's "No link yet?" card with Hub. join/[token] redeems.
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Glyph } from '@/features/integrations/glyphs';
import { extractToken, pastedInvite } from '@/features/signin/inviteToken';
import { PasteButton } from '@/features/signin/PasteButton';
import { BackButton, Heading, Pill, SignInFrame } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { Ledge } from '@/features/walkers';
import { signOut } from '@/services/auth';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { G8_COPY, G8_UI_COPY, SIGNIN_COPY } from '@shared/config/copy';
import { FAMILY_MEGA_DEFAULTS } from '@shared/config/looks';
import { CTA_SIZES } from '@shared/config/theme';

/** The camera scanner is native only (G8 decision 6). */
const canScan = () => Platform.OS !== 'web';

export default function InviteRoute() {
  const tokens = useTokens();
  const C = SIGNIN_COPY.invite;
  const [input, setInput] = useState('');
  const [pasted, setPasted] = useState<'none' | 'nothing' | 'notInvite'>('none');
  const token = extractToken(input);
  const linked = token.length > 0;
  const go = () => linked && router.push(`/join/${token}` as never);
  const scan = canScan();
  const onPasted = (text: string) => {
    const found = pastedInvite(text);
    if (found.kind === 'invite') {
      setInput(found.text);
      setPasted('none');
    } else setPasted(found.kind);
  };
  const notInvite = pasted === 'notInvite';

  return (
    <SignInFrame presentation="sheet" scene={linked ? SIGNIN_SCENES.inviteLinked : SIGNIN_SCENES.invite} testID="invite">
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
          <View style={styles.fieldRow}>
            <TextInput
              value={input}
              onChangeText={(text) => {
                setInput(text);
                if (pasted !== 'none') setPasted('none');
              }}
              placeholder={C.placeholder}
              placeholderTextColor={tokens.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={go}
              aria-invalid={notInvite}
              style={{
                flex: 1,
                color: tokens.text,
                backgroundColor: tokens.surface,
                borderColor: notInvite ? tokens.warn : poked ? tokens.accent : tokens.line,
                borderWidth: 1,
                borderRadius: tokens.radii.lg,
                paddingLeft: tokens.spacing.md,
                // Room for the Paste button inside the field's right edge (board LoginInvite).
                paddingRight: 96 + tokens.spacing.md,
                height: CTA_SIZES.normal.height,
                fontSize: tokens.type.body.fontSize,
              }}
              accessibilityLabel={C.label}
            />
            <View style={[styles.pasteSlot, { right: tokens.spacing.sm }]}>
              <PasteButton onPasted={onPasted} />
            </View>
          </View>
        )}
      </Ledge>
      {pasted === 'none' ? (
        <Text variant="caption" color="muted" style={{ marginTop: tokens.spacing.sm }}>
          {C.example}
        </Text>
      ) : (
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.feedback, { marginTop: tokens.spacing.sm, gap: tokens.spacing.xs }]}>
          <Glyph name="info" color={tokens.warn} size={16} />
          <Text variant="caption" style={{ flex: 1, color: tokens.warn }}>
            {pasted === 'nothing' ? G8_COPY.pasteNothing : G8_COPY.pasteNotInvite}
          </Text>
        </View>
      )}
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
          {scan ? G8_UI_COPY.orScan : C.or}
        </Text>
        <View style={[styles.rule, { backgroundColor: tokens.line }]} />
      </View>
      {/* The middle card is the "help" ledge either way, so the invite scene (Violet pokes it) is the same. */}
      <Ledge id="help">
        {scan ? (
          <Pressable
            onPress={() => router.push('/scan' as never)}
            accessibilityRole="button"
            accessibilityLabel={G8_COPY.scanCard}
            accessibilityHint={G8_COPY.scanCardHint}
            style={({ pressed }) => [
              styles.help,
              { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, gap: tokens.spacing.sm, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Glyph name="qr" color={tokens.text} size={64} stroke={1.6} />
            <Text variant="title" weight="700" style={styles.center}>
              {G8_COPY.scanCard}
            </Text>
            <Text color="muted" style={styles.center}>
              {G8_COPY.scanCardHint}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.help, { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, gap: tokens.spacing.sm }]}>
            <MegaSprite hex={FAMILY_MEGA_DEFAULTS.hex} sticker={FAMILY_MEGA_DEFAULTS.sticker} face="happy" scale={2} accessibilityLabel={SIGNIN_COPY.welcome.hubLabel} />
            <Text variant="title" weight="700" style={styles.center}>
              {C.helpTitle}
            </Text>
            <Text color="muted" style={styles.center}>
              {C.helpBody}
            </Text>
          </View>
        )}
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
  fieldRow: { justifyContent: 'center' },
  pasteSlot: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  feedback: { flexDirection: 'row', alignItems: 'center' },
});
