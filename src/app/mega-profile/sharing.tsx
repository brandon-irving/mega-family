import { router } from '@/features/shell/navigation';
import { useSetSharing, useSharing } from '@/data/useMega';
import { AdultOnly } from '@/features/shell/RoleGate';
import { SharingContent } from '@/features/profile/SharingContent';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export default function SharingRoute() { return <AdultOnly><SharingBody /></AdultOnly>; }

function SharingBody() {
  const sharing = useSharing();
  const save = useSetSharing();
  return <Sheet title="Privacy & sharing" onClose={() => router.back()}>
    {sharing === undefined ? <LoadingScreen label="Loading sharing preferences…" /> : sharing ? <SharingContent sharing={sharing} onSave={save} /> : <Text color="muted">Sharing preferences aren’t available for this profile.</Text>}
  </Sheet>;
}
