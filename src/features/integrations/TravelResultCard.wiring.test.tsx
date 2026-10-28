// The connected travel card (CONTRACT v0.15a): its buttons call `travel.answer` with the card's check, and the
// server's reply replaces the buttons' area as the card's status line.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TRAVEL_NOT_SET_UP, TRAVEL_OK } from '@/test/g4Fixtures';
import { TravelResultCard } from './IntegrationCards';

const mockAnswer = jest.fn();
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ member: { role: 'adult' }, family: { timezone: 'America/New_York' } }) }));
jest.mock('@/data/useIntegrations', () => ({ useTravelAnswer: () => mockAnswer }));

beforeEach(() => mockAnswer.mockReset());

test('On my way calls travel.answer with the check id and shows the reply', async () => {
  mockAnswer.mockResolvedValue({ message: 'Got it. I told Partner you’re on your way.', remindAt: null });
  await renderWithTheme(<TravelResultCard card={TRAVEL_OK} megaName="Teal" />);
  await fireEvent.press(screen.getByText('On my way'));
  expect(mockAnswer).toHaveBeenCalledWith({ travelCheckId: TRAVEL_OK.checkId, action: 'on_my_way' });
  expect(await screen.findByText('Got it. I told Partner you’re on your way.')).toBeTruthy();
});

test('Remind me 30 min before calls travel.answer on a not-set-up card', async () => {
  mockAnswer.mockResolvedValue({ message: 'I’ll remind you at 5:00 PM.', remindAt: 1 });
  await renderWithTheme(<TravelResultCard card={TRAVEL_NOT_SET_UP} megaName="Teal" />);
  await fireEvent.press(screen.getByText('Remind me 30 min before'));
  expect(mockAnswer).toHaveBeenCalledWith({ travelCheckId: TRAVEL_NOT_SET_UP.checkId, action: 'remind_30_before' });
  expect(await screen.findByText('I’ll remind you at 5:00 PM.')).toBeTruthy();
  expect(screen.queryByText('Remind me 30 min before')).toBeNull();
});

test('a refused mockAnswer shows a friendly line, never a crash', async () => {
  mockAnswer.mockRejectedValue(new Error('boom'));
  await renderWithTheme(<TravelResultCard card={TRAVEL_OK} megaName="Teal" />);
  await fireEvent.press(screen.getByText('Snooze 5 min'));
  expect(mockAnswer).toHaveBeenCalledWith({ travelCheckId: TRAVEL_OK.checkId, action: 'snooze_5' });
  expect(screen.getByText('On my way')).toBeTruthy();
});
