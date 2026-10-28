// I have an invite (Screen 9 board LoginInvite): paste the invite link (or just its code), then join/[token]
// does the actual redeem. PLACEHOLDER (scan): the board's "Scan QR code" card is designed (LoginScan) but
// needs expo-camera in the G8 native build, so it's left out until then rather than shown disabled.
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { extractToken } from '@/features/signin/inviteToken';
import { BackButton, Heading, Pill, SignInFrame } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { Ledge } from '@/features/walkers';
import { signOut } from '@/services/auth';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { CTA_SIZES } from '@shared/config/theme';

export default function InviteRoute() {
  const tokens = useTokens();
  const [input, setInput] = useState('');
  const token = extractToken(input);
  const linked = token.length > 0;

  return (
    <SignInFrame scene={linked ? SIGNIN_SCENES.inviteLinked : SIGNIN_SCENES.invite} testID="invite">
      {/* Back from here after Welcome's anonymous session: signing out is what returns to Welcome (the gate
          only shows it signed out). From "Join a family" (signed in with no family) it's a plain back. */}
      <BackButton onPress={() => (router.canGoBack() ? router.back() : signOut())} />
      <View style={{ marginTop: tokens.spacing.lg }}>
        <Heading title={SIGNIN_COPY.invite.title} body={SIGNIN_COPY.invite.body} />
      </View>
      <View style={{ flex: 1 }} />
      <Text variant="caption" color="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: tokens.spacing.sm }}>
        {SIGNIN_COPY.invite.label}
      </Text>
      <Ledge id="field">
        {({ poked }) => (
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={SIGNIN_COPY.invite.placeholder}
            placeholderTextColor={tokens.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => linked && router.push(`/join/${token}` as never)}
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
            accessibilityLabel={SIGNIN_COPY.invite.label}
          />
        )}
      </Ledge>
      <Ledge id="cont" pressable style={{ marginTop: tokens.spacing.xl }}>
        {({ poked, lookHere }) => (
          <Pill
            variant={linked ? 'inverse' : 'outline'}
            label={SIGNIN_COPY.invite.cont}
            disabled={!linked}
            poked={poked && linked}
            onPress={() => {
              lookHere();
              router.push(`/join/${token}` as never);
            }}
          />
        )}
      </Ledge>
    </SignInFrame>
  );
}
