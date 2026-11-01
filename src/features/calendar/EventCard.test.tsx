import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { useCalendarEvent } from '@/data/useCalendarEvent';
import { router } from '@/features/shell/navigation';
import { EventCard } from './EventCard';
jest.mock('@/data/useCalendarEvent');
jest.mock('@/features/shell/navigation', () => ({ router: { push: jest.fn() } }));
test('a shared event shows live details and opens the calendar', async () => {
  jest.mocked(useCalendarEvent).mockReturnValue({ status: 'ok', data: { event: { title: 'Rehearsal', start: Date.UTC(2026, 10, 3, 17), cancelled: false } as never, timezone: 'America/New_York', ownerName: 'Anela' } });
  await renderWithTheme(<EventCard eventId={'event' as never} />);
  expect(screen.getByText('Rehearsal')).toBeTruthy();
  expect(screen.getByText('Anela’s calendar update')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Open calendar' }));
  expect(router.push).toHaveBeenCalledWith('/family/calendar');
});
test('revoked access does not leave event details visible', async () => {
  jest.mocked(useCalendarEvent).mockReturnValue({ status: 'error', error: new Error('NOT_FOUND') });
  await renderWithTheme(<EventCard eventId={'event' as never} />);
  expect(screen.queryByText('Rehearsal')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open calendar' })).toBeNull();
});
