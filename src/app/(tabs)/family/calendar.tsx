// Full family calendar (PLAN §4; GD Screen 12): week strip + day agenda, household and private layers,
// color-coded by member, with Hub's clash banner for adults when a fix is waiting.
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { LINKS } from '@shared/domain/api';
import { useCalendarRange, useFamilyMembers } from '@/data/useFamily';
import { useHubName } from '@/data/useMega';
import { useOpenProposals } from '@/data/useCalendarLayers';
import { useViewer } from '@/data/useViewer';
import { isAdultRole } from '@/features/shell/familyDirectory';
import { toPath } from '@/features/shell/links';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { useTokens } from '@/ui/theme';
import { CalendarContent, eventLayer, type CalendarClash, type EventDoc } from '@/features/family/CalendarContent';
import { EventPlaceSheet } from '@/features/integrations/EventPlaceSheet';
import { usePlaces, useSetEventPlace } from '@/data/useIntegrations';
import { useUpcomingHolidays } from '@/data/useShopping';
import { useRunAction } from '@/features/shell/useRunAction';
import type { Id } from '@shared/domain/validators';
import { CALENDAR_COPY } from '@shared/config/copy';
import { formatLocalTime, formatLocalWeekday } from '@shared/time';

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
  const [opened, setOpened] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-only read of the clock
  useEffect(() => setOpened(Date.now()), []);
  const weekStart = opened !== null ? startOfWeek(opened) : null;
  const weekEnd = weekStart !== null ? weekStart + 7 * 24 * 60 * 60 * 1000 : null;
  const events = useCalendarRange(weekStart, weekEnd);
  const members = useFamilyMembers();
  const viewer = useViewer();
  const adult = !!viewer && isAdultRole(viewer.member.role);
  const proposals = useOpenProposals(adult);
  const hubName = useHubName();
  const tokens = useTokens();
  // G4 (board EventPlace): an adult taps an event to pick its saved place.
  const places = usePlaces();
  // G4b (board HolidayCalendar): public holidays marked on their day; a failed or stub read marks none.
  const holidays = useUpcomingHolidays();
  const setEventPlace = useSetEventPlace();
  const placeAction = useRunAction();
  const [editing, setEditing] = useState<EventDoc | null>(null);
  const placeList = places.status === 'ok' ? places.data : [];
  const placeLabels = Object.fromEntries(placeList.map((p) => [p._id, p.label]));
  const tz = viewer?.family.timezone ?? 'UTC';

  if (weekStart === null || opened === null || events === undefined || members === undefined) return <LoadingScreen label="Loading calendar…" />;

  const open = proposals.status === 'ok' ? proposals.data.find((p) => p.proposal.status === 'pending') : undefined;
  const clash: CalendarClash | null = open ? { eventIds: open.clashEventIds, line: open.proposal.title, messageId: open.proposal.messageId } : null;

  return (
    <Sheet presentation="tab" title={new Date(opened).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} onClose={() => router.back()}>
      <CalendarContent
        weekStart={weekStart}
        todayIndex={new Date(opened).getDay()}
        events={events}
        members={members.map((m) => ({ _id: m.member._id, name: m.member.name, hex: m.mega?.look.hex ?? tokens.muted }))}
        viewerId={viewer?.member._id}
        hubName={open?.mega.name ?? hubName}
        clash={clash}
        onSeeClash={(c) => router.push(toPath(c.messageId ? LINKS.chatMessage(c.messageId) : LINKS.chat()) as never)}
        onOpenEvent={adult ? (e) => setEditing(e) : undefined}
        placeLabels={placeLabels}
        holidays={holidays.status === 'ok' ? holidays.data : undefined}
      />
      <EventPlaceSheet
        open={editing !== null}
        event={{
          title: editing?.title ?? '',
          when: editing ? `${formatLocalWeekday(editing.start, tz)} ${formatLocalTime(editing.start, tz)}` : '',
          layer: editing && eventLayer(editing) === 'private' ? CALENDAR_COPY.onlyYou : CALENDAR_COPY.household,
          placeId: editing?.placeId ?? null,
          place: editing?.place,
        }}
        places={placeList}
        busy={placeAction.busy !== null}
        error={placeAction.error}
        onSave={(placeId) => {
          if (!editing) return;
          void placeAction.run('place', () => setEventPlace({ eventId: editing._id, patch: { placeId: (placeId as Id<'places'> | null) } })).then((ok) => ok && setEditing(null));
        }}
        onClose={() => setEditing(null)}
      />
    </Sheet>
  );
}
