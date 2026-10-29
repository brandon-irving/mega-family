// Member detail sheet (PLAN §4): Message / Visit room / Kid controls / read kid chat, and for someone who
// hasn't joined yet, their invite (QR code + link; G5 UX review).
import { router, useLocalSearchParams } from 'expo-router';
import type { Id } from '@shared/domain/validators';
import { G5_FIX_COPY } from '@shared/config/copy';
import { canReadKidThread } from '@shared/domain/family';
import { InvitePanel } from '@/features/family/InvitePanel';
import { useKidThread, useMemberDetail, useSetKidControls } from '@/data/useFamily';
import { useMegaDirectory } from '@/data/useMegaDirectory';
import { useViewer } from '@/data/useViewer';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { MemberDetailContent } from '@/features/family/MemberDetailContent';
import { KidThreadView } from '@/features/family/KidThreadView';

export default function MemberDetailRoute() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const id = memberId as Id<'members'>;
  const detail = useMemberDetail(id);
  const viewer = useViewer();
  const setKidControls = useSetKidControls();
  const megaById = useMegaDirectory();
  // G6 fix (P0): `detail.canReadChat` is also true for your *own* card (self-match, a different
  // concern), which used to fire `kidThread` for yourself too — the backend's `isParentOf` check is
  // never true of yourself, so it threw an uncaught FORBIDDEN instead of just not subscribing. Only
  // ask when the viewer is actually this member's parent and that kid's "parents can read chats"
  // control is on — the same rule `convex/family.ts`'s `kidThread` enforces (shared/domain/family.ts).
  const canReadThisKidThread = !!viewer && canReadKidThread(viewer.isParentOf.includes(id), detail?.kidControls?.parentsCanReadChat);
  const kidThread = useKidThread(canReadThisKidThread ? id : null);
  const tokens = useTokens();

  if (detail === undefined) return <LoadingScreen label="Loading member…" />;
  if (!detail) return <LoadingScreen label="Member not found" />;

  return (
    <Sheet presentation="tab" title={detail.member.name} onClose={() => router.back()}>
      <MemberDetailContent
        detail={detail}
        onMessage={() => router.push('/chat' as never)}
        onVisitRoom={() => router.push(`/hq/${id}` as never)}
        onChangeKidControls={(patch) => setKidControls({ memberId: id, patch })}
        onOpenSearches={() => router.push(`/searches/${id}` as never)}
        onOpenRules={() => router.push(`/rules/${id}` as never)}
      />
      {detail.member.joinedAt == null && (
        <>
          <Text variant="label" color="muted" style={{ marginTop: tokens.spacing.md, marginBottom: tokens.spacing.sm }}>
            {G5_FIX_COPY.inviteTitle}
          </Text>
          <InvitePanel memberId={id} name={detail.member.name} />
        </>
      )}
      {canReadThisKidThread && (
        <>
          <Text variant="label" color="muted" style={{ marginTop: tokens.spacing.md }}>
            THEIR CHAT (READ-ONLY)
          </Text>
          <KidThreadView messages={kidThread.results} megaById={megaById} loading={kidThread.status === 'LoadingFirstPage'} kidName={detail.member.name} />
        </>
      )}
    </Sheet>
  );
}
