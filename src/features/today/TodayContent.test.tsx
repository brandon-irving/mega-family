import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TodayContent } from './TodayContent';

test('Today opens lists and shows failed responses without losing the action', async () => {
  const onOpenLists = jest.fn();
  const onOpenCalendar = jest.fn();
  const onRespondRequest = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const today = { statement: null, events: [{ _id: 'event_1', title: 'Practice', start: 1793296800000 }], lists: [{ list: { _id: 'list_1', name: 'Groceries' }, open: 3 }], waitingOnYou: [{ kind: 'request', request: { _id: 'request_1', text: 'Can you pick up Sam?' } }] } as never;
  await renderWithTheme(<TodayContent today={today} onOpenLists={onOpenLists} onOpenCalendar={onOpenCalendar} onRespondRequest={onRespondRequest} onAnswerNotification={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Open list: Groceries'));
  expect(onOpenLists).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText('Open calendar: Practice'));
  expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  await act(async () => { await fireEvent.press(screen.getByText('Yes')); });
  expect(screen.getByRole('alert')).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByText('Yes')); });
  expect(onRespondRequest).toHaveBeenCalledTimes(2);
  expect(onRespondRequest).toHaveBeenLastCalledWith('request_1', true);
});
