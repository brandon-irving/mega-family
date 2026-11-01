import { recordedAction } from '@/services/demoRecording';
import { DemoSessionBar } from '@/features/settings/DemoSessionBar';
// mega://join/<token> — the invite (Screen 9 boards, canvas v33). Owner, Oct 28: adults and kids get
// different screens, picked from the invite itself (`invites.preview`), and the MEGA the admin made for the
// person comes with it.
//   Adult (LoginPreview): who invited them, the MEGA made for them, who's already here; "Looks good, join"
//     or "Change my MEGA" (name, color, sticker, personality — applied on join).
//   Kid (LoginPreviewKid): their big MEGA ("Admin made Zap just for you."), a grown-up step, then the
//     5-digit parent code; kids can't change the MEGA here. Five wrong codes lock the invite.
//   Expired (LoginExpired), locked (LoginLocked), or a link that didn't work.
// PLACEHOLDER (kid code): the KidCode board's keypad comes with onboarding (G5); until then the grown-up
// types the code into a number field.
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { router } from '@/features/shell/navigation';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { errorCopyFor } from '@/data/errorCopy';
import { useInvitePreview } from '@/data/useInvite';
import { LookPersonalityContent } from '@/features/profile/LookPersonalityContent';
import { BackButton, DifferentAccount, Pill, SignInFrame } from '@/features/signin/parts';
import { useDismiss } from '@/ui/dismiss';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import { Ledge, MegaLoader, Obstacle } from '@/features/walkers';
import { api } from '@/data/api';
import { MegaBadge } from '@/ui/MegaBadge';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { LIMITS } from '@shared/config/limits';
import { FAMILY_MEGA_DEFAULTS, INVITE_MEGA_DEFAULTS, PERSONALITIES } from '@shared/config/looks';
import { CTA_SIZES } from '@shared/config/theme';
import type { InvitePreview } from '@shared/domain/api';
import type { ErrorCode } from '@shared/domain/enums';

type Ok = Extract<InvitePreview, { status: 'ok' }>;
type InviteMega = Ok['mega'];
const C = SIGNIN_COPY.join;
const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: ErrorCode } | undefined)?.code : undefined);
const back = () => (router.canGoBack() ? router.back() : router.replace('/invite'));
const toInvite = () => router.replace('/invite');

export default function JoinRoute() {
  return <View style={{ flex: 1 }}><DemoSessionBar /><JoinContent /></View>;
}

function JoinContent() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const preview = useInvitePreview(token);
  // A RATE_LIMITED redeem locks the invite mid-visit, before the preview catches up.
  const [locked, setLocked] = useState(false);

  if (preview === undefined) return <MegaLoader text={C.loading} />;
  if (locked || preview.status === 'locked') return <Locked />;
  if (preview.status === 'expired') return <Expired inviter={preview.inviterName} />;
  if (preview.status === 'invalid') return <Invalid />;
  return preview.kind === 'kid' ? <KidInvite token={token} preview={preview} onLocked={() => setLocked(true)} /> : <AdultInvite token={token} preview={preview} />;
}

/** One redeem call for both invite kinds: busy and error state, chat on success, `onLocked` on RATE_LIMITED. */
function useJoin(token: string, onLocked?: () => void) {
  // CONTRACT.md v0.5: invites.redeem is an action (its wrong-code counter commits even when the call fails).
  const redeem = useAction(api.invites.redeem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async (extra: { parentCode?: string; mega?: InviteMega }) => {
    setBusy(true);
    setError(null);
    try {
      await recordedAction('invite.redeem', redeem)({ token, ...extra });
      router.replace('/chat' as never);
    } catch (e) {
      if (codeOf(e) === 'RATE_LIMITED' && onLocked) onLocked();
      else setError(errorCopyFor(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, join };
}

function AdultInvite({ token, preview }: { token: string; preview: Ok }) {
  const tokens = useTokens();
  const [mega, setMega] = useState<InviteMega>(preview.mega);
  const [changed, setChanged] = useState(false);
  const [editing, setEditing] = useState(false);
  const { busy, error, join } = useJoin(token);

  if (editing)
    return (
      <ChangeMega
        mega={mega}
        onBack={() => setEditing(false)}
        onSave={(next) => {
          setMega(next);
          setChanged(true);
          setEditing(false);
        }}
      />
    );

  return (
    <SignInFrame presentation="sheet" scene={SIGNIN_SCENES.adultInvite} busy={busy} testID="join-adult">
      <BackButton onPress={back} />
      <Text variant="caption" color="muted" weight="600" style={[styles.eyebrow, { marginTop: tokens.spacing.sm }]}>
        {C.invitedBy(preview.inviterName)}
      </Text>
      <Text variant="display" accessibilityRole="header" style={{ marginTop: tokens.spacing.xs }}>
        {C.adultTitle}
      </Text>
      <Text color="muted" style={{ marginTop: tokens.spacing.sm }}>
        {C.adultBody(preview.inviterName)}
      </Text>
      <View style={styles.fill} />
      <Ledge id="card">
        <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, gap: tokens.spacing.xs }]}>
          <MegaSprite hex={mega.look.hex} sticker={mega.look.sticker} face="happy" scale={3} accessibilityLabel={mega.name} />
          <Text variant="headline" style={[styles.center, { marginTop: tokens.spacing.sm }]}>
            {mega.name}
          </Text>
          <Text variant="label" color="muted" style={styles.center}>
            {C.adultMegaSub(PERSONALITIES[mega.personality].label, preview.inviterName)}
          </Text>
          {preview.family.length ? (
            <>
              <View style={[styles.rule, { backgroundColor: tokens.line, marginVertical: tokens.spacing.md }]} />
              <Text variant="caption" color="muted" weight="600" style={styles.eyebrow}>
                {C.alreadyHere}
              </Text>
              <View style={[styles.family, { marginTop: tokens.spacing.sm }]}>
                {preview.family.map((f) => (
                  <View key={f.name} style={[styles.member, { gap: tokens.spacing.xs }]}>
                    <MegaBadge hex={f.hex} sticker={f.sticker} face="happy" size={32} />
                    <Text variant="caption" color="muted" numberOfLines={1}>
                      {f.name}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </Ledge>
      <View style={styles.fill} />
      {error ? <ErrorLine text={error} /> : null}
      <Pill hero variant="inverse" label={C.keep} loading={busy} onPress={() => join(changed ? { mega } : {})} />
      <View style={{ marginTop: tokens.spacing.md }}>
        <Pill variant="outline" label={C.change} disabled={busy} onPress={() => setEditing(true)} />
      </View>
      <View style={{ marginTop: tokens.spacing.sm }}>
        <DifferentAccount />
      </View>
    </SignInFrame>
  );
}

/** "Change my MEGA": a name plus the existing look & personality picker (src/features/profile). */
function ChangeMega({ mega, onBack, onSave }: { mega: InviteMega; onBack: () => void; onSave: (next: InviteMega) => void }) {
  const tokens = useTokens();
  const [name, setName] = useState(mega.name);
  // Android back and Escape (web) step back out of the picker (owner, Oct 28: every overlay closes).
  useDismiss(onBack);
  return (
    <View style={[styles.fill, { backgroundColor: tokens.bg }]} testID="join-change">
      <ScrollView keyboardDismissMode="on-drag" contentContainerStyle={{ padding: tokens.spacing.xl, paddingTop: tokens.spacing.xxl }} keyboardShouldPersistTaps="handled">
        <BackButton onPress={onBack} />
        <Text variant="display" accessibilityRole="header" style={{ marginVertical: tokens.spacing.md }}>
          {C.changeTitle}
        </Text>
        <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
          {C.nameLabel}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={INVITE_MEGA_DEFAULTS.maxNameLength}
          accessibilityLabel={C.nameLabel}
          style={{ color: tokens.text, backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.lg, paddingHorizontal: tokens.spacing.md, height: CTA_SIZES.normal.height, fontSize: tokens.type.body.fontSize, marginBottom: tokens.spacing.lg }}
        />
        <LookPersonalityContent
          value={{ hex: mega.look.hex, sticker: mega.look.sticker, personality: mega.personality }}
          onSave={(v) => onSave({ name: name.trim() || mega.name, look: { ...mega.look, hex: v.hex, sticker: v.sticker }, personality: v.personality })}
        />
      </ScrollView>
    </View>
  );
}

function KidInvite({ token, preview, onLocked }: { token: string; preview: Ok; onLocked: () => void }) {
  const tokens = useTokens();
  const [step, setStep] = useState<'meet' | 'code'>('meet');
  const [parentCode, setParentCode] = useState('');
  const { busy, error, join } = useJoin(token, onLocked);
  const { mega } = preview;

  if (step === 'code')
    return (
      <SignInFrame presentation="sheet" scene={SIGNIN_SCENES.kidInvite} busy={busy} testID="join-kid-code">
        <BackButton onPress={() => setStep('meet')} />
        <View style={[styles.fill, styles.middle]}>
          <MegaSprite hex={mega.look.hex} sticker={mega.look.sticker} face="happy" scale={3} accessibilityLabel={mega.name} />
          <Text variant="display" accessibilityRole="header" style={[styles.center, { marginTop: tokens.spacing.lg }]}>
            {C.codeTitle}
          </Text>
          <Text variant="title" color="muted" weight="400" style={[styles.center, { marginTop: tokens.spacing.sm }]}>
            {C.codeBody}
          </Text>
        </View>
        <Obstacle id="parentCode">
        <TextInput
          value={parentCode}
          onChangeText={(t) => setParentCode(t.replace(/\D/g, '').slice(0, 5))}
          placeholder={C.codePlaceholder}
          placeholderTextColor={tokens.muted}
          keyboardType="number-pad"
          maxLength={5}
          accessibilityLabel={C.codeLabel}
          style={{
            color: tokens.text,
            backgroundColor: tokens.surface,
            borderColor: tokens.line,
            borderWidth: 1,
            borderRadius: tokens.radii.lg,
            paddingHorizontal: tokens.spacing.md,
            height: CTA_SIZES.kid.height,
            fontSize: CTA_SIZES.kid.fontSize,
            textAlign: 'center',
            letterSpacing: parentCode ? 8 : 0,
          }}
        />
        </Obstacle>
        {error ? <ErrorLine text={error} /> : null}
        <View style={{ marginTop: tokens.spacing.lg }}>
          <Pill variant="inverse" size={CTA_SIZES.kid} label={C.codeJoin} loading={busy} onPress={() => join({ parentCode: parentCode || undefined })} />
        </View>
      </SignInFrame>
    );

  return (
    <SignInFrame presentation="sheet" scene={SIGNIN_SCENES.kidInvite} testID="join-kid">
      <BackButton onPress={back} />
      <Text variant="label" color="muted" weight="600" style={[styles.eyebrow, styles.center, { marginTop: tokens.spacing.sm }]}>
        {C.invitedBy(preview.inviterName)}
      </Text>
      <Text variant="display" accessibilityRole="header" style={[styles.center, { marginTop: tokens.spacing.xs }]}>
        {C.kidTitle(mega.name)}
      </Text>
      <View style={[styles.fill, styles.middle]}>
        <MegaSprite hex={mega.look.hex} sticker={mega.look.sticker} face="happy" scale={4} accessibilityLabel={mega.name} />
        <Text variant="title" weight="400" style={[styles.center, { marginTop: tokens.spacing.md }]}>
          {C.kidBody(preview.inviterName, mega.name)}
        </Text>
      </View>
      <Ledge id="kidCard">
        <View style={[styles.grownUp, { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg, gap: tokens.spacing.md }]}>
          <View style={styles.fill}>
            <Text variant="title" weight="700">
              {C.grownUpTitle}
            </Text>
            <Text variant="title" color="muted" weight="400" style={{ marginTop: tokens.spacing.xs }}>
              {C.grownUpBody(mega.name)}
            </Text>
          </View>
        </View>
      </Ledge>
      <View style={{ marginTop: tokens.spacing.xl }}>
        <Pill variant="inverse" size={CTA_SIZES.kid} label={C.grownUpHere} onPress={() => setStep('code')} />
      </View>
      <View style={{ marginTop: tokens.spacing.sm }}>
        <DifferentAccount />
      </View>
    </SignInFrame>
  );
}

function Expired({ inviter }: { inviter: string }) {
  const tokens = useTokens();
  const E = SIGNIN_COPY.expired;
  return (
    <SignInFrame presentation="sheet" scene={SIGNIN_SCENES.expired} testID="join-expired">
      <BackButton onPress={back} />
      <View style={[styles.fill, styles.middle]}>
        <Ledge id="expiredCard">
          <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, gap: tokens.spacing.sm }]}>
            <MegaSprite hex={FAMILY_MEGA_DEFAULTS.hex} sticker={FAMILY_MEGA_DEFAULTS.sticker} face="closed" scale={3} accessibilityLabel={E.hubAsleep} />
            <Text variant="caption" color="muted" weight="600" style={[styles.eyebrow, { marginTop: tokens.spacing.sm }]}>
              {E.eyebrow(inviter)}
            </Text>
            <Text variant="headline" accessibilityRole="header" style={styles.center}>
              {E.title}
            </Text>
            <Text color="muted" style={styles.center}>
              {E.body(inviter, LIMITS.invite.ttlHours / 24)}
            </Text>
          </View>
        </Ledge>
      </View>
      <Pill hero variant="inverse" label={E.action} onPress={toInvite} />
      <View style={{ marginTop: tokens.spacing.sm }}>
        <DifferentAccount />
      </View>
    </SignInFrame>
  );
}

function Invalid() {
  const tokens = useTokens();
  const I = SIGNIN_COPY.invalid;
  return (
    <SignInFrame presentation="sheet" scene={SIGNIN_SCENES.expired} testID="join-invalid">
      <BackButton onPress={back} />
      <View style={[styles.fill, styles.middle]}>
        <Ledge id="expiredCard">
          <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, gap: tokens.spacing.sm }]}>
            <MegaSprite hex={FAMILY_MEGA_DEFAULTS.hex} sticker={FAMILY_MEGA_DEFAULTS.sticker} face="calm" scale={3} accessibilityLabel={SIGNIN_COPY.welcome.hubLabel} />
            <Text variant="headline" accessibilityRole="header" style={[styles.center, { marginTop: tokens.spacing.sm }]}>
              {I.title}
            </Text>
            <Text color="muted" style={styles.center}>
              {I.body}
            </Text>
          </View>
        </Ledge>
      </View>
      <Pill hero variant="inverse" label={I.action} onPress={toInvite} />
    </SignInFrame>
  );
}

function Locked() {
  const tokens = useTokens();
  const L = SIGNIN_COPY.locked;
  return (
    <SignInFrame presentation="sheet" scene={SIGNIN_SCENES.locked} testID="join-locked">
      <View style={[styles.fill, styles.middle]}>
        <Ledge id="lock">
          <View style={{ gap: tokens.spacing.md }}>
            <Text variant="display" accessibilityRole="header" style={styles.center}>
              {L.title}
            </Text>
            <Text variant="title" color="muted" weight="400" style={styles.center}>
              {L.body}
            </Text>
          </View>
        </Ledge>
      </View>
      <Pill variant="inverse" size={CTA_SIZES.kid} label={L.action} onPress={toInvite} />
    </SignInFrame>
  );
}

function ErrorLine({ text }: { text: string }) {
  const tokens = useTokens();
  return (
    <Text color="muted" accessibilityRole="alert" style={[styles.center, { marginBottom: tokens.spacing.sm }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  middle: { justifyContent: 'center', alignItems: 'center' },
  center: { textAlign: 'center' },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { alignItems: 'center', borderWidth: 1, alignSelf: 'stretch' },
  rule: { alignSelf: 'stretch', height: 1 },
  family: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-around' },
  member: { alignItems: 'center', flex: 1 },
  grownUp: { flexDirection: 'row', borderWidth: 1 },
});
