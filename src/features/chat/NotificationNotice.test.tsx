// G3 review fix (BLOCKER, "From a notification" notice — CONTRACT §6, PLAN §6, design board
// Push.template.html ~125). Client-side presentation only: formatRelativeTime is pure (easy to pin an
// exact "now"), and the component ticks on its own so "2m ago" advances without a re-render from above.
import { act, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { formatRelativeTime, NotificationNotice } from './NotificationNotice';

describe('formatRelativeTime', () => {
  test('under a minute reads "Just now"', () => {
    expect(formatRelativeTime(0, 30_000)).toBe('Just now');
  });

  test('minutes', () => {
    expect(formatRelativeTime(0, 2 * 60_000)).toBe('2m ago');
  });

  test('hours', () => {
    expect(formatRelativeTime(0, 3 * 60 * 60_000)).toBe('3h ago');
  });

  test('days', () => {
    expect(formatRelativeTime(0, 2 * 24 * 60 * 60_000)).toBe('2d ago');
  });
});

describe('NotificationNotice', () => {
  // Explicitly unmounted (not left for the test file to tear down implicitly) — the component's own
  // 15s relative-time tick (useRelativeTime's setInterval) otherwise keeps running past the test, which
  // is exactly the kind of leak that can leave a jest worker unable to exit cleanly.
  test('nothing to show (no sentAt) renders nothing', async () => {
    const rendered = await renderWithTheme(<NotificationNotice sentAt={undefined} />);
    expect(screen.queryByText(/From a notification/)).toBeNull();
    rendered.unmount();
  });

  test('renders the pill with a relative time', async () => {
    const now = Date.now();
    const rendered = await renderWithTheme(<NotificationNotice sentAt={now - 2 * 60_000} />);
    expect(screen.getByText('From a notification · 2m ago')).toBeTruthy();
    rendered.unmount();
  });

  test('the relative time updates on its own as time passes', async () => {
    jest.useFakeTimers();
    const sentAt = Date.now();
    const rendered = await renderWithTheme(<NotificationNotice sentAt={sentAt} />);
    expect(screen.getByText('From a notification · Just now')).toBeTruthy();

    await act(async () => {
      jest.setSystemTime(sentAt + 2 * 60_000);
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('From a notification · 2m ago')).toBeTruthy();
    rendered.unmount();
    jest.useRealTimers();
  });
});
