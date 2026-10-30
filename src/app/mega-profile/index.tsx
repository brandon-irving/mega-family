// MEGA profile sheet (PLAN §3), opened from the chat header badge.
import { router } from '@/features/shell/navigation';
import { useViewer } from '@/data/useViewer';
import { useMegaStatus, useSharing, useUpdateMega } from '@/data/useMega';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { ProfileContent } from '@/features/profile/ProfileContent';
import { PROFILE_COPY } from '@shared/config/copy';
import { AppSettingsButton } from '@/features/shell/AppSettingsButton';

export default function MegaProfileRoute() {
  const viewer = useViewer();
  const status = useMegaStatus(viewer?.mega?._id ?? null);
  const updateMega = useUpdateMega();
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
        settingsAction={<AppSettingsButton />}
        sharing={sharing ?? undefined}
        onRename={(name) => updateMega({ name })}
        onOpenLookPersonality={() => router.push('/mega-profile/look' as never)}
        onOpenSharing={() => router.push('/mega-profile/sharing' as never)}
        onOpenMemories={() => router.push('/mega-profile/memories' as never)}
        onOpenActivity={isAdmin ? () => router.push('/mega-profile/activity' as never) : undefined}
        onOpenRules={viewer.member.role === 'kid' ? () => router.push('/mega-profile/rules' as never) : undefined}
      />
    </Sheet>
  );
}
