// Full family calendar (PLAN §4): week strip + day agenda, color-coded by member.
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useCalendarRange, useFamilyMembers } from '@/data/useFamily';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { useTokens } from '@/ui/theme';
import { CalendarContent } from '@/features/family/CalendarContent';

function startOfWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export default function CalendarRoute() {
  // Date.now() is impure, so it's read once on mount (not during render) and held in state — this
  // screen opens pinned to "this week" as of when it was opened, not recomputed on every re-render.
  // A single setState-on-mount effect is the documented escape hatch for seeding state from an
  // external, non-reactive source (React docs: "You Might Not Need an Effect" — initializing state).
  const [weekStart, setWeekStart] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-only read of the clock
  useEffect(() => setWeekStart(startOfWeek(Date.now())), []);
  const weekEnd = weekStart !== null ? weekStart + 7 * 24 * 60 * 60 * 1000 : null;
  const events = useCalendarRange(weekStart, weekEnd);
  const members = useFamilyMembers();
  const tokens = useTokens();

  if (weekStart === null || events === undefined || members === undefined) return <LoadingScreen label="Loading calendar…" />;

  return (
    <Sheet title="Calendar" onClose={() => router.back()}>
      <CalendarContent
        weekStart={weekStart}
        events={events}
        members={members.map((m) => ({ _id: m.member._id, name: m.member.name, hex: m.mega?.look.hex ?? tokens.muted }))}
      />
    </Sheet>
  );
}
