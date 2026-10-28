// A kid's blocked and changed searches, for their parents (G4 Screen 14 board SearchLog). Opened from the
// kid's member sheet. The switch is the kid control `tellsParents.blockedSearches`; the server returns rows
// only while it's on (and FORBIDDEN otherwise), so the list loads only then.
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { Id } from '@shared/domain/validators';
import { G4_COPY, fillCopy } from '@shared/config/copy';
import { errorCopyFor } from '@/data/errorCopy';
import { useMemberDetail, useSetKidControls } from '@/data/useFamily';
import { useKidSearchLog } from '@/data/useIntegrations';
import { useViewer } from '@/data/useViewer';
import { useRunAction } from '@/features/shell/useRunAction';
import { SearchLogContent } from '@/features/integrations/SearchLogContent';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export default function KidSearchesRoute() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const id = memberId as Id<'members'>;
  const viewer = useViewer();
  const detail = useMemberDetail(id);
  const setKidControls = useSetKidControls();
  const { busy, error, run } = useRunAction();
  // The clock is read once when the page opens ("Today" / "Yesterday" labels), not on every render.
  const [now] = useState(() => Date.now());
  const controls = detail?.kidControls ?? null;
  const on = controls?.tellsParents.blockedSearches ?? false;
  const log = useKidSearchLog(on ? id : null);

  if (viewer === undefined || detail === undefined) return <LoadingScreen label={G4_COPY.searchesButton} />;
  if (!detail || !controls) return <LoadingScreen label={G4_COPY.searchesButton} />;
  const kidName = detail.member.name;

  return (
    <Sheet title={fillCopy(G4_COPY.searchesTitle, { kid: kidName })} onClose={() => router.back()}>
      <SearchLogContent
        kidName={kidName}
        on={on}
        busy={busy !== null}
        onToggle={(next) => void run('toggle', () => setKidControls({ memberId: id, patch: { tellsParents: { ...controls.tellsParents, blockedSearches: next } } }))}
        rows={on && log.status === 'ok' ? log.data.page : null}
        tz={viewer?.family.timezone ?? 'UTC'}
        now={now}
      />
      {error ? <Text color="muted">{error}</Text> : null}
      {on && log.status === 'error' ? <Text color="muted">{errorCopyFor(log.error)}</Text> : null}
    </Sheet>
  );
}
