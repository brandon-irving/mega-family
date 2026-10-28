// Look & personality screen (PLAN §3; owner, Oct 28): color, sticker, the Store parts (antenna, eyes, eye
// color) and personality, via megas.update. Kids pick only from what they own (the Store catalog's `owned`
// items plus the free basics, src/features/profile/wardrobe.ts); the server checks the same rule.
import { router } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { useUpdateMega } from '@/data/useMega';
import { useStoreCatalog } from '@/data/useStore';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { LookPersonalityContent } from '@/features/profile/LookPersonalityContent';
import { wardrobeFor } from '@/features/profile/wardrobe';
import { PROFILE_COPY } from '@shared/config/copy';

export default function LookRoute() {
  const viewer = useViewer();
  const updateMega = useUpdateMega();
  // Kids only (adults get FORBIDDEN from the Store and don't need it: their looks are all free).
  const catalog = useStoreCatalog();

  if (viewer === undefined) return <LoadingScreen label="Loading…" />;
  if (!viewer?.mega) return <LoadingScreen label="No MEGA yet" />;
  const role = viewer.member.role;
  if (role === 'kid' && catalog.status === 'loading') return <LoadingScreen label="Loading…" />;

  const look = viewer.mega.look;
  const owned = role === 'kid' && catalog.status === 'ok' ? catalog.data.items.filter((i) => i.owned).map((i) => i.id) : null;
  return (
    <Sheet title={PROFILE_COPY.lookTitle} onClose={() => router.back()}>
      <LookPersonalityContent
        value={{ hex: look.hex, sticker: look.sticker, personality: viewer.mega.personality, antenna: look.antenna, eyes: look.eyes, eyeColor: look.eyeColor }}
        wardrobe={wardrobeFor(role, owned, look)}
        onSave={async ({ hex, sticker, personality, antenna, eyes, eyeColor }) => {
          await updateMega({ look: { hex, sticker, antenna, eyes, eyeColor }, personality });
          router.back();
        }}
      />
    </Sheet>
  );
}
