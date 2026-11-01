import { useRef, useState } from 'react';
import { useAddPerson } from '@/data/useOnboarding';
import { useViewer } from '@/data/useViewer';
import { errorCopyFor } from '@/data/errorCopy';
import { Text } from '@/ui/Text';
import { router } from '@/features/shell/navigation';
import { useFamilyMembers, useComingUp, useNextFamilyEvent } from '@/data/useFamily';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { FamilyContent } from '@/features/family/FamilyContent';

export default function FamilyRoute() {
  const viewer = useViewer();
  const addPerson = useAddPerson();
  const adding = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const begin = async () => {
    if (adding.current) return;
    adding.current = true; setBusy(true); setError(null);
    try { await addPerson({}); router.toTab('/chat'); }
    catch (e) { setError(errorCopyFor(e)); }
    finally { adding.current = false; setBusy(false); }
  };
  const members = useFamilyMembers();
  const comingUp = useComingUp();
  const nextEvent = useNextFamilyEvent();

  if (members === undefined || comingUp === undefined) return <LoadingScreen label="Loading family…" />;

  return (
    <Screen scroll presentation="tab">
      <FamilyContent
        onAddPerson={viewer?.member.role === 'admin' ? () => void begin() : undefined}
        addingPerson={busy}
        members={members}
        comingUp={comingUp}
        nextEvent={nextEvent}
        onOpenMember={(memberId) => router.push(`/family/${memberId}` as never)}
        onOpenCalendar={() => router.push('/family/calendar' as never)}
        onOpenPlaces={() => router.push('/places' as never)}
        onOpenLists={() => router.push('/family/lists' as never)}
      />
      {error ? <Text color="muted" accessibilityRole="alert">{error}</Text> : null}
    </Screen>
  );
}
