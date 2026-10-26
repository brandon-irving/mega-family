// MEGA profile sheet (PLAN §3), opened from the chat header badge.
import { router } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { useMegaStatus, useSetSharing, useSharing, useUpdateMega } from '@/data/useMega';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { ProfileContent } from '@/features/profile/ProfileContent';

export default function MegaProfileRoute() {
  const viewer = useViewer();
  const status = useMegaStatus(viewer?.mega?._id ?? null);
  const updateMega = useUpdateMega();
  const setSharing = useSetSharing();
  const sharing = useSharing();

  if (viewer === undefined) return <LoadingScreen label="Opening profile…" />;
  if (!viewer?.mega) return <LoadingScreen label="No MEGA yet" />;

  const isAdult = viewer.member.role !== 'kid';
  const isAdmin = viewer.member.role === 'admin';

  return (
    <Sheet title="MEGA profile" onClose={() => router.back()}>
      <ProfileContent
        mega={viewer.mega}
        statusLine={status ? (status.busy ? status.label : 'Available') : ''}
        canRename={isAdult}
        canSeeSharing={isAdult}
        isAdmin={isAdmin}
        sharing={sharing ?? undefined}
        onRename={(name) => updateMega({ name })}
        onOpenLookPersonality={() => router.push('/mega-profile/look' as never)}
        onChangeSharing={(patch) => setSharing(patch)}
        onOpenMemories={() => router.push('/mega-profile/memories' as never)}
      />
    </Sheet>
  );
}
