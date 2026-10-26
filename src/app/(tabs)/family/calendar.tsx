// Full family calendar (PLAN §4): week strip + day agenda, color-coded by member.
import { useMemo } from 'react';
import { router } from 'expo-router';
import { useCalendarRange, useFamilyMembers } from '@/data/useFamily';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { CalendarContent } from '@/features/family/CalendarContent';

function startOfWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export default function CalendarRoute() {
  const weekStart = useMemo(() => startOfWeek(Date.now()), []);
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const events = useCalendarRange(weekStart, weekEnd);
  const members = useFamilyMembers();

  if (events === undefined || members === undefined) return <LoadingScreen label="Loading calendar…" />;

  return (
    <Sheet title="Calendar" onClose={() => router.back()}>
      <CalendarContent
        weekStart={weekStart}
        events={events}
        members={members.map((m) => ({ _id: m.member._id, name: m.member.name, hex: m.mega?.look.hex ?? '#9AA1AB' }))}
      />
    </Sheet>
  );
}
