import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { useQueryState } from './useQuery';
export const useCalendarEvent = (eventId: Id<'events'>) => useQueryState(api.calendar.event, { eventId });
