// Renders every result Card kind (CONTRACT §3).
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CARDS_BY_KIND, NOTIFICATION_FIXTURE, NOTIFICATION_HELD_FIXTURE } from '@/test/fixtures';
import { ResultCard } from './Cards';

// G4: the search/weather/travel cards read the viewer's timezone and role (src/features/integrations).
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ member: { role: 'adult' }, family: { timezone: 'America/New_York' } }) }));
// The travel card's buttons call `travel.answer` (v0.15a); these render tests have no Convex client.
jest.mock('@/data/useIntegrations', () => ({ useTravelAnswer: () => jest.fn() }));

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

  test('a card kind this build does not know renders nothing instead of crashing (GD)', async () => {
    const view = await renderWithTheme(<ResultCard card={{ kind: 'fromTheFuture' } as never} />);
    expect(view.toJSON()).toBeNull();
  });

  test('weather card', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.weather} />);
    expect(screen.getByText('Clear, 68°F')).toBeTruthy();
  });

  test('travel card', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.travel} />);
    expect(screen.getByText(/Soccer practice/)).toBeTruthy();
    expect(screen.getByText(/^Leave by /)).toBeTruthy();
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

  // G3 scope: "kid: held for quiet hours" (design board: "Saved from 9:10 PM · quiet hours").
  test('a held notification shows the quiet-hours notice alongside its buttons', async () => {
    await renderWithTheme(<ResultCard card={{ kind: 'notification', notificationId: NOTIFICATION_HELD_FIXTURE._id }} notification={NOTIFICATION_HELD_FIXTURE} />);
    expect(screen.getByText(/Saved from .* · quiet hours/)).toBeTruthy();
    expect(screen.getByText('On my way')).toBeTruthy();
  });

  test('an unheld notification shows no quiet-hours notice', async () => {
    await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={NOTIFICATION_FIXTURE} />);
    expect(screen.queryByText(/quiet hours/)).toBeNull();
  });

  // G3 review fix (HIGH, kid button sizes), revised Oct 28: notification buttons go through the shared
  // ButtonRow lines, every button filling its share of a line (never content-width).
  test('notification buttons fill their line (shared ButtonRow layout)', async () => {
    const flexOf = (style: unknown) => Object.assign({}, ...([style].flat(3).filter(Boolean) as object[])).flex as number | undefined;
    const rendered = await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={NOTIFICATION_FIXTURE} onAnswerNotification={() => {}} />);
    expect(rendered.getAllByTestId('button-row-line').length).toBeGreaterThan(0);
    for (const button of rendered.getAllByRole('button')) expect(flexOf(button.props.style)).toBe(1);
  });

  // G3 review fix (HIGH, reminder card title): the backend now sends a real headline in
  // notification.title — rendered unless it's just the MEGA's name again (legacy rows), since that name
  // is already shown in the chat header (ChatHeader.tsx) and would otherwise show twice.
  describe('notification card title vs. the chat header MEGA name', () => {
    test('a real headline (not the MEGA name) renders', async () => {
      await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={NOTIFICATION_FIXTURE} megaName="Teal" />);
      expect(screen.getByText('Coral asks')).toBeTruthy();
    });

    test('a legacy row whose title is just the MEGA name again hides the title line', async () => {
      const legacy = { ...NOTIFICATION_FIXTURE, title: 'Teal' };
      await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={legacy} megaName="Teal" />);
      expect(screen.queryByText('Teal')).toBeNull();
      expect(screen.getByText('Can you grab milk on your way home?')).toBeTruthy(); // body still shows
    });

    test('with no megaName known yet, the title still shows (never hidden by mistake)', async () => {
      await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={NOTIFICATION_FIXTURE} />);
      expect(screen.getByText('Coral asks')).toBeTruthy();
    });
  });

  // G3 scope: "kid: reminders only with bigger buttons" — sizing comes for free from the theme's
  // role-based tokens (src/ui/theme.tsx resolveSizing), so a kid viewer's buttons are simply taller.
  //
  // G3 review fix (HIGH, kid button sizes): now the exact design-board pair (shared/config/theme.ts
  // BUTTON_SIZES, from design/build/Push.template.html's SIZES: adult 44pt, kid 54pt) rather than the
  // generic touch-target scale.
  //
  // Kept last in the file: this test's explicit `.unmount()` between two renders leaves the RNTL/RN
  // test renderer in a state that breaks `screen`-based queries in whatever test runs after it in this
  // file (a pre-existing harness quirk, not something introduced here) — observed when tests were added
  // after it; keeping it last avoids that rather than papering over it per-test.
  test('a kid viewer sees bigger notification buttons than an adult, matching the design board', async () => {
    const minHeightOf = (style: unknown): number => {
      const flat = (Array.isArray(style) ? style : [style]).filter(Boolean) as Record<string, unknown>[];
      const found = flat.find((s) => typeof s.minHeight === 'number');
      return found?.minHeight as number;
    };

    const adult = await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={NOTIFICATION_FIXTURE} onAnswerNotification={() => {}} />, { role: 'adult' });
    const adultHeight = minHeightOf(adult.getAllByRole('button')[0].props.style);
    adult.unmount();
    const kid = await renderWithTheme(<ResultCard card={CARDS_BY_KIND.notification} notification={NOTIFICATION_FIXTURE} onAnswerNotification={() => {}} />, { role: 'kid' });
    const kidHeight = minHeightOf(kid.getAllByRole('button')[0].props.style);
    expect(adultHeight).toBe(44);
    expect(kidHeight).toBe(54);
  });
});
