// Family places (G4 Screen 14 boards Places / PlaceSheet / PlacesKid): household data every member can read;
// adults add, edit and remove (the add/edit bottom sheet). Opened from Family (adults) and the MEGA profile.
// A modal page with a Close control in its safe-area header (Sheet), plus Android back / swipe-down.
import { useState } from 'react';
import { router } from '@/features/shell/navigation';
import { G4_COPY } from '@shared/config/copy';
import { PLACES } from '@shared/config/integrations';
import { errorCopyFor } from '@/data/errorCopy';
import { usePlaceActions, usePlaces } from '@/data/useIntegrations';
import { useViewer } from '@/data/useViewer';
import { useRunAction } from '@/features/shell/useRunAction';
import { PlacesContent, PlaceSheet, type PlaceDraft } from '@/features/integrations/PlacesContent';
import type { PlaceDoc } from '@/features/integrations/types';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export default function PlacesRoute() {
  const viewer = useViewer();
  const places = usePlaces();
  const { upsert, remove } = usePlaceActions();
  const { busy, error, run } = useRunAction();
  const [editing, setEditing] = useState<{ place: PlaceDoc | null } | null>(null);

  if (viewer === undefined || places.status === 'loading') return <LoadingScreen label={G4_COPY.placesTitle} />;
  const canEdit = (PLACES.editors as readonly string[]).includes(viewer?.member.role ?? 'kid');
  const list = places.status === 'ok' ? places.data : [];
  const hasHome = list.some((p) => p.kind === 'home' && p._id !== editing?.place?._id);

  const save = async (draft: PlaceDraft) => {
    const ok = await run('save', () => upsert({ ...(editing?.place ? { placeId: editing.place._id } : {}), ...draft }));
    if (ok) setEditing(null);
  };
  const removePlace = async () => {
    if (!editing?.place) return;
    const ok = await run('remove', () => remove({ placeId: editing.place!._id }));
    if (ok) setEditing(null);
  };

  return (
    <Sheet title={G4_COPY.placesTitle} onClose={() => router.back()}>
      {places.status === 'error' ? <Text color="muted">{errorCopyFor(places.error)}</Text> : null}
      <PlacesContent places={list} canEdit={canEdit} onAdd={() => setEditing({ place: null })} onEdit={(place) => setEditing({ place })} />
      <PlaceSheet
        open={editing !== null}
        place={editing?.place ?? null}
        hasHome={hasHome}
        busy={busy !== null}
        error={error}
        onSave={(d) => void save(d)}
        onRemove={() => void removePlace()}
        onClose={() => setEditing(null)}
      />
    </Sheet>
  );
}
