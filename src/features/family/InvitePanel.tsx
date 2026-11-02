import { DemoInviteButton } from './DemoInviteButton';
import { AssistantBriefPanel } from './AssistantBriefPanel';
// An unjoined member's invite (G5 UX review, Oct 29; board OnboardInvite): the QR code, the link, when it stops
// working, Send invite link (the share sheet; on web, where there may be none, it copies), Copy link and New
// code. Used by the chat's "Invite sent" card and by the member's Family page. The server keeps only a hash of
// each invite's token, so a link can't be read back later: the panel makes one when asked and remembers it for
// this session (queryMemory, cleared on account switch). If the server can say an invite is already waiting
// (`invites.forMember`, pending in the contract), that line shows above the button.
import { useRef, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { Id } from '@shared/domain/validators';
import type { InviteStatus } from '@shared/domain/api';
import { G5_FIX_COPY as C, fillCopy } from '@shared/config/copy';
import { formatLocalDateTime } from '@shared/time';
import { errorCopyFor } from '@/data/errorCopy';
import { recallQuery, rememberQuery } from '@/data/queryMemory';
import { useFamilyMembers } from '@/data/useFamily';
import { useCreateInvite, useMemberInvite } from '@/data/useInvite';
import { useViewer } from '@/data/useViewer';
import { Button } from '@/ui/Button';
import { QrCode } from '@/ui/QrCode';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type InviteCode = { url: string; qrPayload: string; expiresAt: number };

const QR_SIZE = 200;

export function InvitePanelView({
  name,
  invite,
  status,
  error,
  busy,
  timeZone,
  onCreate,
  onRegenerate,
}: {
  name: string;
  invite: InviteCode | null;
  /** What the server says about the member's last invite (`invites.forMember`); its link can't be shown again. */
  status?: InviteStatus | null;
  error?: string | null;
  busy?: boolean;
  timeZone: string;
  onCreate: () => void;
  onRegenerate: () => void;
}) {
  const tokens = useTokens();
  const [copied, setCopied] = useState(false);

  const copy = async (url: string) => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  };
  const send = async (url: string) => {
    try {
      await Share.share({ message: fillCopy(C.inviteShareMessage, { name, url }) });
    } catch {
      // No share sheet (a desktop browser): copying is the next best thing.
      await copy(url);
    }
  };

  if (status?.status === 'joined') return <Text color="muted">{name || 'This person'} has joined the family.</Text>;

  if (!invite) {
    return (
      <View style={{ gap: tokens.spacing.sm }}>
        {status?.status === 'pending' ? (
          <Text color="muted">{fillCopy(C.inviteWaiting, { when: formatLocalDateTime(status.expiresAt, timeZone, { weekday: 'short' }), who: status.invitedByName })}</Text>
        ) : status?.status === 'expired' ? (
          <Text color="muted">{fillCopy(C.inviteExpired, { when: formatLocalDateTime(status.expiresAt, timeZone, { weekday: 'short' }) })}</Text>
        ) : null}
        {error ? <Text color="muted">{error}</Text> : null}
        <Button label={C.inviteShow} onPress={onCreate} loading={busy} disabled={busy} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text color="muted">{fillCopy(C.inviteHint, { name })}</Text>
      <View style={{ alignSelf: 'center', borderRadius: tokens.radii.sm, overflow: 'hidden' }}>
        <QrCode value={invite.qrPayload} size={QR_SIZE} accessibilityLabel={C.inviteQrLabel} />
      </View>
      <Text selectable numberOfLines={1} ellipsizeMode="middle" color="muted" style={{ textAlign: 'center' }}>
        {invite.url}
      </Text>
      <Text color="muted" style={{ textAlign: 'center' }}>
        {fillCopy(C.inviteExpires, { when: formatLocalDateTime(invite.expiresAt, timeZone, { weekday: 'short' }) })}
      </Text>
      {error ? <Text color="muted">{error}</Text> : null}
      <Button label={C.inviteSend} onPress={() => void send(invite.url)} style={{ alignSelf: 'stretch' }} />
      <Button label={copied ? C.inviteCopied : C.inviteCopy} variant="secondary" onPress={() => void copy(invite.url)} style={{ alignSelf: 'stretch' }} />
      <Button
        label={C.inviteNew}
        variant="ghost"
        onPress={() => {
          setCopied(false);
          onRegenerate();
        }}
        loading={busy}
        disabled={busy}
        style={{ alignSelf: 'stretch' }}
      />
      <Text variant="caption" color="muted">
        {C.inviteFoot}
      </Text>
    </View>
  );
}

const memoryKey = (memberId: string) => `invite:${memberId}`;

/** The live panel: makes the member's invite on request and keeps it for this session. */
export function InvitePanel({ memberId, name, showBrief = true }: { memberId: Id<'members'>; name?: string; showBrief?: boolean }) {
  const tokens = useTokens();
  const viewer = useViewer();
  const members = useFamilyMembers();
  const who = name ?? members?.find((m) => m.member._id === memberId)?.member.name ?? '';
  const create = useCreateInvite();
  const waiting = useMemberInvite(memberId);
  const [invite, setInvite] = useState<InviteCode | null>(() => recallQuery<InviteCode>(memoryKey(memberId)) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const making = useRef(false);
  const make = async () => {
    if (making.current) return;
    making.current = true;
    setBusy(true);
    setError(null);
    try {
      const made = await create({ memberId });
      rememberQuery(memoryKey(memberId), made);
      setInvite(made);
    } catch (e) {
      setError(errorCopyFor(e));
    } finally {
      making.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: tokens.spacing.md }}>
    {showBrief ? <AssistantBriefPanel memberId={memberId} name={who} /> : null}
    <InvitePanelView
      name={who}
      invite={invite}
      status={waiting}
      error={error}
      busy={busy}
      timeZone={viewer?.family.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
      onCreate={() => void make()}
      onRegenerate={() => void make()}
    />
    {invite && waiting?.status !== 'joined' && <DemoInviteButton url={invite.url} />}
    </View>
  );
}
