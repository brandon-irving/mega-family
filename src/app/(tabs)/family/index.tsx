import { router } from 'expo-router';
import { useFamilyMembers, useComingUp } from '@/data/useFamily';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { FamilyContent } from '@/features/family/FamilyContent';

export default function FamilyRoute() {
  const members = useFamilyMembers();
  const comingUp = useComingUp();

  if (members === undefined || comingUp === undefined) return <LoadingScreen label="Loading family…" />;

  return (
    <Screen scroll presentation="tab">
      <FamilyContent
        members={members}
        comingUp={comingUp}
        onOpenMember={(memberId) => router.push(`/family/${memberId}` as never)}
        onOpenCalendar={() => router.push('/family/calendar' as never)}
      />
    </Screen>
  );
}
