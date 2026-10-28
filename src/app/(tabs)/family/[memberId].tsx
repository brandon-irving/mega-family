// Member detail sheet (PLAN §4): Message / Visit room / Kid controls / read kid chat.
import { router, useLocalSearchParams } from 'expo-router';
import type { Id } from '@shared/domain/validators';
import { useKidThread, useMemberDetail, useSetKidControls } from '@/data/useFamily';
import { useMegaDirectory } from '@/data/useMegaDirectory';
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
  const setKidControls = useSetKidControls();
  const megaById = useMegaDirectory();
  const kidThread = useKidThread(detail?.canReadChat ? id : null);
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
      />
      {detail.canReadChat && detail.member.role === 'kid' && (
        <>
          <Text variant="label" color="muted" style={{ marginTop: tokens.spacing.md }}>
            THEIR CHAT (READ-ONLY)
          </Text>
          <KidThreadView messages={kidThread.results} megaById={megaById} />
        </>
      )}
    </Sheet>
  );
}
