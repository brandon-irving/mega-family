import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { SettingsSection, ValueRow } from '@/features/settings/rows';
import type { EventDoc } from './CalendarContent';

export function EventDetailSheet({ event, timeZone, people, placeLabel, onClose, onEditPlace }: { event: EventDoc | null; timeZone: string; people: string[]; placeLabel?: string; onClose: () => void; onEditPlace?: () => void }) {
  const date = event ? new Date(event.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone }) : '';
  const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone });
  return <ModalSheet open={!!event} title="Event details" closeLabel="Close event details" onClose={onClose}>
    {event ? <>
      <Text variant="headline">{event.title}</Text>
      <Text color="muted">{date}</Text>
      <SettingsSection>
        <ValueRow label="When" value={event.allDay ? 'All day' : event.end ? `${time(event.start)} – ${time(event.end)}` : time(event.start)} />
        {people.length ? <ValueRow label="Who" value={people.join(', ')} /> : null}
        <ValueRow label="Visibility" value={event.scope === 'personal' ? 'Only you' : event.scope === 'adults' ? 'Adults' : event.scope === 'shared' ? 'Shared with selected people' : 'Family'} />
        <ValueRow label="Place" value={placeLabel || event.place || 'No place added'} />
      </SettingsSection>
      {onEditPlace ? <Button label={placeLabel || event.place ? 'Change place' : 'Add a place'} variant="secondary" onPress={onEditPlace} /> : null}
    </> : null}
  </ModalSheet>;
}
