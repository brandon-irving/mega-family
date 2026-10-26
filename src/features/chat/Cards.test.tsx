// Renders every result Card kind (CONTRACT §3).
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CARDS_BY_KIND } from '@/test/fixtures';
import { ResultCard } from './Cards';

describe('ResultCard', () => {
  test('event card shows its visibility', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.event} />);
    expect(screen.getByText('Event saved')).toBeTruthy();
    expect(screen.getByText('Visible to Family')).toBeTruthy();
  });

  test('reminder card', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.reminder} />);
    expect(screen.getByText('Reminder set')).toBeTruthy();
    expect(screen.getByText('Visible to Only me')).toBeTruthy();
  });

  test('list card shows added items', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.list} />);
    expect(screen.getByText('Added: Eggs, Bread')).toBeTruthy();
  });

  test('search card shows the answer and sources', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.search} />);
    expect(screen.getByText('About 29,032 feet.')).toBeTruthy();
    expect(screen.getByText('National Geographic Kids')).toBeTruthy();
  });

  test('weather card', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.weather} />);
    expect(screen.getByText('Clear, 68°F')).toBeTruthy();
  });

  test('travel card', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.travel} />);
    expect(screen.getByText(/Soccer practice/)).toBeTruthy();
  });

  test('request card answers through onRespondRequest', async () => {
    const onRespondRequest = jest.fn();
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.request} onRespondRequest={onRespondRequest} />);
    await fireEvent.press(screen.getByText('Yes'));
    expect(onRespondRequest).toHaveBeenCalledWith(true);
  });

  test('notification card renders its buttons and answers through onAnswerNotification', async () => {
    const onAnswerNotification = jest.fn();
    await renderWithTheme(
      <ResultCard card={CARDS_BY_KIND.notification} onAnswerNotification={onAnswerNotification} notificationButtons={[{ id: 'on_my_way', label: 'On my way' }]} />,
    );
    await fireEvent.press(screen.getByText('On my way'));
    expect(onAnswerNotification).toHaveBeenCalledWith('on_my_way');
  });
});
