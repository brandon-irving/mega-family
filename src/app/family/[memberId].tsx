import { AssistantBriefPanel } from '@/features/family/AssistantBriefPanel';
// Member detail sheet (PLAN §4): Message / Visit room / Kid controls / read kid chat, and for someone who
// hasn't joined yet, their invite (QR code + link; G5 UX review).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { router } from '@/features/shell/navigation';
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

  const profile = <>
      <MemberDetailContent
        detail={detail}
        onMessage={() => router.toTab('/chat')}
        onVisitRoom={() => router.toTab(`/hq/${id}` as never)}
        onChangeKidControls={(patch) => setKidControls({ memberId: id, patch })}
        onOpenSearches={() => router.push(`/searches/${id}` as never)}
        onOpenRules={() => router.push(`/rules/${id}` as never)}
      />
      {detail.member.joinedAt != null && viewer && viewer.member._id !== id && (viewer.member.role === 'admin' || viewer.isParentOf.includes(id)) ? <AssistantBriefPanel memberId={id} name={detail.member.name} joined /> : null}
      {detail.member.joinedAt == null && viewer && (viewer.member.role === 'admin' || viewer.isParentOf.includes(id)) && (
        <>
          <Text variant="label" color="muted" style={{ marginTop: tokens.spacing.md, marginBottom: tokens.spacing.sm }}>
            {G5_FIX_COPY.inviteTitle}
          </Text>
          <InvitePanel memberId={id} name={detail.member.name} />
        </>
      )}
  </>;
  return (
    <Sheet title={detail.member.name} onClose={() => router.back()} scroll={!canReadThisKidThread}>
      {canReadThisKidThread ? (
        <>
          {/* Keep the virtualized chat outside the profile's ScrollView, with its own bounded viewport. */}
          <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={{ maxHeight: '50%', flexGrow: 0 }} contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
            {profile}
          </ScrollView>
          <Text variant="label" color="muted" style={{ padding: tokens.spacing.lg, paddingBottom: tokens.spacing.sm }}>
            THEIR CHAT (READ-ONLY)
          </Text>
          <View testID="kid-thread-viewport" style={{ flex: 1 }}>
            <KidThreadView messages={kidThread.results} megaById={megaById} loading={kidThread.status === 'LoadingFirstPage'} kidName={detail.member.name} />
          </View>
        </>
      ) : profile}
    </Sheet>
  );
}
