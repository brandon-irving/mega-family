// MEGA profile sheet (PLAN §3), opened from the chat header badge.
import { router } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { useMegaStatus, useSetSharing, useSharing, useUpdateMega } from '@/data/useMega';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { ProfileContent } from '@/features/profile/ProfileContent';
import { PROFILE_COPY } from '@shared/config/copy';

export default function MegaProfileRoute() {
  const viewer = useViewer();
  const status = useMegaStatus(viewer?.mega?._id ?? null);
  const updateMega = useUpdateMega();
  const setSharing = useSetSharing();
  const sharing = useSharing();

  if (viewer === undefined) return <LoadingScreen label="Opening profile…" />;
  if (!viewer?.mega) return <LoadingScreen label="No MEGA yet" />;

  const isAdmin = viewer.member.role === 'admin';

  return (
    <Sheet title={PROFILE_COPY.title} onClose={() => router.back()}>
      <ProfileContent
        mega={viewer.mega}
        role={viewer.member.role}
        statusLine={status ? (status.busy ? status.label : 'Available') : ''}
        isAdmin={isAdmin}
        // Notifications, quiet hours and the theme all live in Settings (G5).
        onOpenNotifications={() => router.push('/settings' as never)}
        onOpenTheme={() => router.push('/settings' as never)}
        sharing={sharing ?? undefined}
        onRename={(name) => updateMega({ name })}
        onOpenLookPersonality={() => router.push('/mega-profile/look' as never)}
        onChangeSharing={(patch) => setSharing(patch)}
        onOpenMemories={() => router.push('/mega-profile/memories' as never)}
        onOpenActivity={isAdmin ? () => router.push('/mega-profile/activity' as never) : undefined}
        onOpenRules={viewer.member.role === 'kid' ? () => router.push('/mega-profile/rules' as never) : undefined}
      />
    </Sheet>
  );
}
