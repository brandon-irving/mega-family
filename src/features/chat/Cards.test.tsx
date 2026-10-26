// Renders every result Card kind (CONTRACT §3).
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CARDS_BY_KIND, NOTIFICATION_FIXTURE } from '@/test/fixtures';
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

  test('request card renders Yes before I can\'t (BUTTON_SETS order, G1 fix #3) and answers through onRespondRequest', async () => {
    const onRespondRequest = jest.fn();
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.request} onRespondRequest={onRespondRequest} />);
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Yes', "I can't"]);
    await fireEvent.press(screen.getByText('Yes'));
    expect(onRespondRequest).toHaveBeenCalledWith(true);
  });

  test('notification card shows a loading state until the notification doc resolves', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  // G1 fix: a `{ kind: 'notification' }` card used to render only the word "Notification" — nothing
  // else was wired to load its content. This proves the real title, body and buttons show up once the
  // doc is resolved (notifications.get, CONTRACT §4 v0.6), in the order stored on it.
  test('notification card renders its MEGA title, body and buttons (in stored order) and answers through onAnswerNotification', async () => {
    const onAnswerNotification = jest.fn();
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} onAnswerNotification={onAnswerNotification} notification={NOTIFICATION_FIXTURE} />);
    expect(screen.getByText('Coral asks')).toBeTruthy();
    expect(screen.getByText('Can you grab milk on your way home?')).toBeTruthy();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Yes', "I can't"]);
    await fireEvent.press(screen.getByText('Yes'));
    expect(onAnswerNotification).toHaveBeenCalledWith('yes');
  });

  test('once answered, the notification card shows the answer instead of its buttons', async () => {
    const answered = { ...NOTIFICATION_FIXTURE, answer: { buttonId: 'yes', at: Date.now(), via: 'block' as const } };
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={answered} />);
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
