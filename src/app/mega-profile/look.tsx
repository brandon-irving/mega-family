// Look & personality screen (PLAN §3): color, sticker, personality, via megas.update.
import { router } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { useUpdateMega } from '@/data/useMega';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { LookPersonalityContent } from '@/features/profile/LookPersonalityContent';

export default function LookRoute() {
  const viewer = useViewer();
  const updateMega = useUpdateMega();

  if (viewer === undefined) return <LoadingScreen label="Loading…" />;
  if (!viewer?.mega) return <LoadingScreen label="No MEGA yet" />;

  return (
    <Sheet title="Look & personality" onClose={() => router.back()}>
      <LookPersonalityContent
        value={{ hex: viewer.mega.look.hex, sticker: viewer.mega.look.sticker, personality: viewer.mega.personality }}
        onSave={async ({ hex, sticker, personality }) => {
          await updateMega({ look: { hex, sticker }, personality });
          router.back();
        }}
      />
    </Sheet>
  );
}
