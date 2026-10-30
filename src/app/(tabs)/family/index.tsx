import { router } from '@/features/shell/navigation';
import { useFamilyMembers, useComingUp, useNextFamilyEvent } from '@/data/useFamily';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { FamilyContent } from '@/features/family/FamilyContent';

export default function FamilyRoute() {
  const members = useFamilyMembers();
  const comingUp = useComingUp();
  const nextEvent = useNextFamilyEvent();

  if (members === undefined || comingUp === undefined) return <LoadingScreen label="Loading family…" />;

  return (
    <Screen scroll presentation="tab">
      <FamilyContent
        members={members}
        comingUp={comingUp}
        nextEvent={nextEvent}
        onOpenMember={(memberId) => router.push(`/family/${memberId}` as never)}
        onOpenCalendar={() => router.push('/family/calendar' as never)}
        onOpenPlaces={() => router.push('/places' as never)}
        onOpenLists={() => router.push('/family/lists' as never)}
      />
    </Screen>
  );
}
