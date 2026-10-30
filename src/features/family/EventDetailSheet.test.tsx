import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { EventDetailSheet } from './EventDetailSheet';

jest.mock('@/ui/ModalSheet', () => ({ ModalSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? children : null }));
const event = { _id: 'event_1', title: 'Soccer', start: Date.UTC(2026, 9, 29, 20), scope: 'family', place: 'School field', who: ['member_1'] } as never;
test('event details show the event before offering a separate place editor', async () => {
  const onEditPlace = jest.fn();
  await renderWithTheme(<EventDetailSheet event={event} timeZone="America/New_York" people={['Sam']} onClose={jest.fn()} onEditPlace={onEditPlace} />);
  expect(screen.getByText('Soccer')).toBeTruthy();
  expect(screen.getByText('School field')).toBeTruthy();
  expect(onEditPlace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Change place'));
  expect(onEditPlace).toHaveBeenCalledTimes(1);
});
test('read-only event detail has no editing affordance', async () => {
  await renderWithTheme(<EventDetailSheet event={event} timeZone="UTC" people={['Sam']} onClose={jest.fn()} />);
  expect(screen.queryByText('Change place')).toBeNull();
});
