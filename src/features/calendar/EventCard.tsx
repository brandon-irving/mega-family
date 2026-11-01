import type { Id } from '@shared/domain/validators';
import { formatLocalDateTime, formatLocalTime } from '@shared/time';
import { useCalendarEvent } from '@/data/useCalendarEvent';
import { CardFallback } from '@/features/kids/CardFallback';
import { router } from '@/features/shell/navigation';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';

export function EventCard({ eventId }: { eventId: Id<'events'> }) {
  const state = useCalendarEvent(eventId);
  if (state.status !== 'ok') return <CardFallback state={state} from="Calendar" />;
  const { event, timezone, ownerName } = state.data;
  return <Card>
    <Text variant="caption" color="muted">{ownerName ? `${ownerName}’s calendar update` : 'Your calendar update'}</Text>
    <Text variant="label">{event.title}</Text>
    <Text>{formatLocalDateTime(event.start, timezone)}{event.end ? `–${formatLocalTime(event.end, timezone)}` : ''}</Text>
    {event.cancelled ? <Text>Cancelled</Text> : <Text color="muted">{ownerName ? 'Does this affect your plans? We can coordinate here in chat.' : 'You can review this on your calendar.'}</Text>}
    <Button label="Open calendar" variant="secondary" onPress={() => router.push('/family/calendar')} />
  </Card>;
}
