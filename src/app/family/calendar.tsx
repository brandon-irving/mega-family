// Full family calendar (PLAN §4; GD Screen 12): week strip + day agenda, household and private layers,
// color-coded by member, with Hub's clash banner for adults when a fix is waiting.
import { useState } from 'react';
import { router } from '@/features/shell/navigation';
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
import { CalendarContent, addLocalDays, eventLayer, startOfLocalWeek, type CalendarClash, type EventDoc } from '@/features/family/CalendarContent';
import { EventPlaceSheet } from '@/features/integrations/EventPlaceSheet';
import { usePlaces, useSetEventPlace } from '@/data/useIntegrations';
import { useFamilyNow, useUpcomingHolidays } from '@/data/useShopping';
import { HOLIDAYS } from '@shared/config/shopping';
import { useRunAction } from '@/features/shell/useRunAction';
import type { Id } from '@shared/domain/validators';
import { CALENDAR_COPY } from '@shared/config/copy';
import { formatLocalTime, formatLocalWeekday } from '@shared/time';
import { EventDetailSheet } from '@/features/family/EventDetailSheet';

export default function CalendarRoute() {
  // "This week" comes from the family's clock (`clock.get`; the demo clock is pinned to the seed week), never
  // the device's. G4b UX review: the week pages back and forward, so a holiday's week can be reached.
  const now = useFamilyNow();
  const [weekShift, setWeekShift] = useState(0);
  const thisWeek = now !== undefined ? startOfLocalWeek(now) : null;
  const weekStart = thisWeek !== null ? addLocalDays(thisWeek, weekShift * 7) : null;
  const weekEnd = weekStart !== null ? addLocalDays(weekStart, 7) : null;
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
  // Paging ahead reaches past the default window, so ask for the longest one.
  const holidays = useUpcomingHolidays(HOLIDAYS.maxUpcomingDays);
  const setEventPlace = useSetEventPlace();
  const placeAction = useRunAction();
  const [editing, setEditing] = useState<EventDoc | null>(null);
  const [selected, setSelected] = useState<EventDoc | null>(null);
  const placeList = places.status === 'ok' ? places.data : [];
  const placeLabels = Object.fromEntries(placeList.map((p) => [p._id, p.label]));
  const tz = viewer?.family.timezone ?? 'UTC';

  if (weekStart === null || now === undefined || events === undefined || members === undefined) return <LoadingScreen label="Loading calendar…" />;

  const open = proposals.status === 'ok' ? proposals.data.find((p) => p.proposal.status === 'pending') : undefined;
  const clash: CalendarClash | null = open ? { eventIds: open.clashEventIds, line: open.proposal.title, messageId: open.proposal.messageId } : null;

  return (
    <Sheet title={new Date(weekStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} onClose={() => router.back()}>
      <CalendarContent
        key={weekStart}
        weekStart={weekStart}
        todayIndex={weekShift === 0 ? new Date(now).getDay() : null}
        onPrevWeek={() => setWeekShift((w) => w - 1)}
        onNextWeek={() => setWeekShift((w) => w + 1)}
        onThisWeek={() => setWeekShift(0)}
        events={events}
        members={members.map((m) => ({ _id: m.member._id, name: m.member.name, hex: m.mega?.look.hex ?? tokens.muted }))}
        viewerId={viewer?.member._id}
        hubName={open?.mega.name ?? hubName}
        clash={clash}
        onSeeClash={(c) => router.toTab(toPath(c.messageId ? LINKS.chatMessage(c.messageId) : LINKS.chat()) as never)}
        onOpenEvent={setSelected}
        placeLabels={placeLabels}
        holidays={holidays.status === 'ok' ? holidays.data : undefined}
      />
      <EventDetailSheet event={selected} timeZone={tz} people={selected ? selected.who.map((id) => members.find((m) => m.member._id === id)?.member.name).filter((name): name is string => !!name) : []} placeLabel={selected?.placeId ? placeLabels[selected.placeId] : undefined} onClose={() => setSelected(null)} onEditPlace={adult && selected ? () => { setEditing(selected); setSelected(null); } : undefined} />
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
