// G5 UX review (Oct 29, finding 1): pasting a real, valid public .ics link left "Adding…" spinning ~90 s with
// Not now disabled — the user was trapped, and the failure then said the same "That link didn't work…" as a
// mistyped link. Now: Not now stays live while a link is being added (skipping never blocks), the add gives up
// after APP_TIMEOUTS.icsAddMs with "Couldn't reach that link", and each server failure gets its own line.
import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import { G5_COPY, G5_FIX_COPY } from '@shared/config/copy';
import { APP_TIMEOUTS } from '@shared/config/appTimeouts';
import { renderWithTheme } from '@/test/renderWithTheme';
import { OFFER_ICS } from '@/test/g5Fixtures';
import { ConnectCardView, type ConnectHandlers } from './ConnectCard';
import { icsFailureCopy, useAddIcsLink } from './useAddIcsLink';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const handlers = (): ConnectHandlers => ({
  onGoogle: jest.fn(),
  onPhone: jest.fn(),
  onOpenSettings: jest.fn(),
  onSkip: jest.fn(),
  onIcsChange: jest.fn(),
  onIcsSubmit: jest.fn(),
  onIcsAnother: jest.fn(),
  onIcsDone: jest.fn(),
});

describe('schedule link card while a link is being added', () => {
  test('Not now stays enabled and skips; only Add link waits', async () => {
    const on = handlers();
    await renderWithTheme(<ConnectCardView view={OFFER_ICS} megaName="Teal" local={{ phoneSupported: true, icsText: 'https://x.example/a.ics', icsBusy: true }} on={on} />);
    const notNow = screen.getByRole('button', { name: G5_COPY.notNow });
    expect(notNow.props.accessibilityState?.disabled ?? false).toBe(false);
    await act(async () => {
      fireEvent.press(notNow);
    });
    expect(on.onSkip).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: G5_FIX_COPY.icsAdding }).props.accessibilityState?.busy ?? screen.getByRole('button', { name: G5_FIX_COPY.icsAdding }).props.accessibilityState?.disabled).toBe(true);
  });
});

describe('icsFailureCopy', () => {
  test('a link that could not be reached is told apart from a malformed one', () => {
    expect(icsFailureCopy('unreachable')).toBe(G5_FIX_COPY.icsUnreachable);
    expect(icsFailureCopy('invalid')).toBe(G5_COPY.icsBad);
    expect(icsFailureCopy('no_result')).toBe(G5_FIX_COPY.icsNotCalendar);
    expect(icsFailureCopy('error')).toBe(G5_FIX_COPY.icsUnreachable);
    expect(icsFailureCopy('something_new')).toBe(G5_FIX_COPY.icsCouldntAdd);
  });
});

describe('useAddIcsLink', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('gives up after the client timeout with "Couldn’t reach that link" and frees the button', async () => {
    const addIcs = jest.fn(() => new Promise<never>(() => {}));
    const { result } = await renderHook(() => useAddIcsLink(addIcs));
    await act(async () => result.current.setText('https://calendar.example.com/basic.ics'));
    let done: Promise<unknown> = Promise.resolve();
    await act(async () => {
      done = result.current.submit();
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(APP_TIMEOUTS.icsAddMs + 1);
      await done;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe(G5_FIX_COPY.icsUnreachable);
  });

  test('a malformed link never calls the server', async () => {
    const addIcs = jest.fn();
    const { result } = await renderHook(() => useAddIcsLink(addIcs));
    await act(async () => result.current.setText('not a link'));
    await act(async () => {
      await result.current.submit();
    });
    expect(addIcs).not.toHaveBeenCalled();
    expect(result.current.error).toBe(G5_COPY.icsBad);
  });

  test('success clears the field and hands back the label and event count', async () => {
    const addIcs = jest.fn(async () => ({ integrationId: 'in_1' as never, label: 'Soccer', events: 9 }));
    const { result } = await renderHook(() => useAddIcsLink(addIcs));
    await act(async () => result.current.setText('https://x.example/a.ics'));
    let added: unknown;
    await act(async () => {
      added = await result.current.submit();
    });
    expect(added).toEqual({ integrationId: 'in_1', label: 'Soccer', events: 9 });
    expect(result.current.text).toBe('');
    expect(result.current.error).toBeNull();
  });
});
