// Settings → Connected accounts (boards SettingsAccounts / SettingsAccountsLapse) and the G5 app services:
// Google connect (only Google's consent host is ever opened on web), the phone calendar's event mapping and sync
// window (expo-calendar SDK 58 shapes), and the on-open re-sync rule. Fixtures: src/test/g5Fixtures.ts.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { G5_COPY, G5_UI_COPY } from '@shared/config/copy';
import { DEVICE_CALENDAR } from '@shared/config/onboarding';
import { GOOGLE } from '@shared/config/google';
import { renderWithTheme } from '@/test/renderWithTheme';
import { GMAIL_CONNECTED, GMAIL_NEEDS_RECONNECT, GOOGLE_CAL_CONNECTED, ICS_CONNECTED, ICS_ERROR, PHONE_CAL_CONNECTED, T0 } from '@/test/g5Fixtures';
import { connectGoogle, isGoogleConsentUrl, scopesFor } from '@/services/googleConnect';
import { syncWindow, toDeviceEvents } from '@/services/phoneCalendar';
import { AccountsContent, type AccountsHandlers } from './AccountsContent';
import { phoneSyncDue } from './usePhoneCalendarFlow';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const press = (el: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(el);
  });
const handlers = (): AccountsHandlers => ({ onConnectGoogle: jest.fn(), onReconnect: jest.fn(), onSyncNow: jest.fn(), onDisconnect: jest.fn(), onAddPhone: jest.fn(), onAddIcs: jest.fn() });

describe('Connected accounts (boards SettingsAccounts / SettingsAccountsLapse)', () => {
  test('connected sources: who and when, a status dot, Sync now / Disconnect with names in their labels', async () => {
    const on = handlers();
    await renderWithTheme(<AccountsContent integrations={[GMAIL_CONNECTED, GOOGLE_CAL_CONNECTED, ICS_CONNECTED]} googleAvailable phoneSupported now={T0} on={on} />);
    expect(screen.getByText(`Connected as ${GMAIL_CONNECTED.label} · Checked 5 min ago`)).toBeTruthy();
    expect(screen.getAllByLabelText(G5_COPY.accountConnected).length).toBeGreaterThan(0);
    await press(screen.getByLabelText('Sync Gmail now'));
    expect(on.onSyncNow).toHaveBeenCalledWith(GMAIL_CONNECTED);
    await press(screen.getByLabelText('Disconnect Gmail'));
    expect(on.onDisconnect).toHaveBeenCalledWith(GMAIL_CONNECTED);
  });

  test('a schedule link shows its site, never its URL; a failing one gets Try again / Remove', async () => {
    const on = handlers();
    await renderWithTheme(<AccountsContent integrations={[ICS_CONNECTED, ICS_ERROR]} googleAvailable phoneSupported now={T0} on={on} />);
    expect(screen.getByText(`${ICS_CONNECTED.host} · Checked 15 min ago`)).toBeTruthy();
    expect(screen.queryByText(/https?:\/\//)).toBeNull();
    expect(screen.getByText(G5_COPY.accountError)).toBeTruthy();
    await press(screen.getByLabelText(`Try ${ICS_ERROR.label} again`));
    expect(on.onSyncNow).toHaveBeenCalledWith(ICS_ERROR);
    await press(screen.getByLabelText(`Remove ${ICS_CONNECTED.label}`));
    expect(on.onDisconnect).toHaveBeenCalledWith(ICS_CONNECTED);
    await press(screen.getByText(G5_COPY.accountAddIcs));
    expect(on.onAddIcs).toHaveBeenCalled();
  });

  test('a lapsed Google grant: the testing hint and one full-width Reconnect, no Sync or Disconnect', async () => {
    const on = handlers();
    await renderWithTheme(<AccountsContent integrations={[GMAIL_NEEDS_RECONNECT]} googleAvailable phoneSupported now={T0} on={on} />);
    expect(screen.getByText(G5_UI_COPY.lapseHint)).toBeTruthy();
    expect(screen.getByText(G5_COPY.accountNeedsReconnect)).toBeTruthy();
    expect(screen.queryByLabelText('Sync Gmail now')).toBeNull();
    await press(screen.getByLabelText('Reconnect Gmail'));
    expect(on.onReconnect).toHaveBeenCalledWith(GMAIL_NEEDS_RECONNECT);
  });

  test('never empty: what isn’t connected keeps its row with a way to connect, or says why it can’t', async () => {
    const on = handlers();
    await renderWithTheme(<AccountsContent integrations={[]} googleAvailable phoneSupported now={T0} on={on} />);
    await press(screen.getByText(G5_UI_COPY.connectGmail));
    expect(on.onConnectGoogle).toHaveBeenCalledWith('gmail');
    await press(screen.getByText(G5_UI_COPY.connectPhone));
    expect(on.onAddPhone).toHaveBeenCalled();
    expect(screen.getByText(G5_UI_COPY.noLinks)).toBeTruthy();
  });

  test('Google not set up and on the web: honest hints, no dead buttons', async () => {
    await renderWithTheme(<AccountsContent integrations={[]} googleAvailable={false} phoneSupported={false} now={T0} on={handlers()} />);
    expect(screen.getAllByText(G5_UI_COPY.googleNotSetUpHint)).toHaveLength(2);
    expect(screen.getByText(G5_UI_COPY.phoneWebHint)).toBeTruthy();
    expect(screen.queryByText(G5_UI_COPY.connectGmail)).toBeNull();
    expect(screen.queryByText(G5_UI_COPY.connectPhone)).toBeNull();
  });

  test('a note under a row after an action (e.g. "Disconnected…")', async () => {
    const line = G5_COPY.accountDisconnected.replace('{what}', 'Gmail');
    await renderWithTheme(<AccountsContent integrations={[PHONE_CAL_CONNECTED]} googleAvailable phoneSupported now={T0} notes={{ gmail: line }} on={handlers()} />);
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(G5_UI_COPY.chooseCalendars)).toBeTruthy();
  });
});

describe('Google connect', () => {
  afterEach(() => jest.restoreAllMocks());
  test('web: opens Google’s consent URL in the same tab, and refuses any other host', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const navigate = jest.fn();
    const googleStart = jest.fn(async () => ({ authUrl: `${GOOGLE.authUrl}?client_id=x&scope=y` }));
    const r = await connectGoogle(['gmail'], { googleStart, googleConnectCode: jest.fn() as never, navigate } as never);
    expect(r).toBe('redirecting');
    expect(googleStart).toHaveBeenCalledWith({ want: ['gmail'] });
    expect(navigate).toHaveBeenCalledWith(`${GOOGLE.authUrl}?client_id=x&scope=y`);

    const evil = jest.fn();
    const r2 = await connectGoogle(['gmail'], { googleStart: async () => ({ authUrl: 'https://evil.example/o/oauth2/v2/auth' }), googleConnectCode: jest.fn() as never, navigate: evil } as never);
    expect(r2).toBe('failed');
    expect(evil).not.toHaveBeenCalled();
    expect(isGoogleConsentUrl('javascript:alert(1)')).toBe(false);
  });

  test('scopes come from config, read-only only', () => {
    expect(scopesFor(['gmail', 'googleCalendar'])).toEqual([GOOGLE.scopes.gmail, GOOGLE.scopes.googleCalendar]);
    expect(scopesFor(['gmail', 'googleCalendar']).every((s) => s.endsWith('.readonly'))).toBe(true);
  });
});

describe('this phone’s calendar', () => {
  test('events → DeviceEventInput: occurrence ids, ms times, local all-day dates, untitled = Busy, soonest first', () => {
    const start = new Date(2026, 10, 7, 0, 0);
    const out = toDeviceEvents([
      { id: 'r1', calendarId: 'c', title: 'Practice', startDate: new Date(T0 + 7200_000).toISOString(), endDate: new Date(T0 + 10_800_000).toISOString() },
      { id: 'r1', calendarId: 'c', title: 'Practice', startDate: new Date(T0 + 3600_000), endDate: new Date(T0 + 7200_000) },
      { id: 'a', calendarId: 'c', title: null, startDate: start, allDay: true, location: 'Home' },
      { id: 'bad', calendarId: 'c', title: 'x', startDate: 'not a date' },
    ]);
    expect(out.map((e) => e.externalId)).toEqual([`r1@${T0 + 3600_000}`, `r1@${T0 + 7200_000}`, `a@${start.getTime()}`]);
    expect(out[2]).toMatchObject({ title: 'Busy', allDay: '2026-11-07', location: 'Home' });
    expect(out[0].end).toBe(T0 + 7200_000);
  });

  test('the sync window is DEVICE_CALENDAR’s, around the family clock', () => {
    const w = syncWindow(T0);
    expect(w.windowStart).toBe(T0 - DEVICE_CALENDAR.pastDays * 86_400_000);
    expect(w.windowEnd).toBe(T0 + DEVICE_CALENDAR.futureDays * 86_400_000);
  });

  test('on open it re-syncs only a connected phone calendar that’s due', () => {
    const due = T0 - DEVICE_CALENDAR.syncEveryMinutes * 60_000;
    expect(phoneSyncDue({ ...PHONE_CAL_CONNECTED, lastSyncAt: due }, T0)).toBe(true);
    expect(phoneSyncDue({ ...PHONE_CAL_CONNECTED, lastSyncAt: T0 - 60_000 }, T0)).toBe(false);
    expect(phoneSyncDue({ ...PHONE_CAL_CONNECTED, status: 'disconnected', lastSyncAt: due }, T0)).toBe(false);
    expect(phoneSyncDue({ ...GMAIL_CONNECTED, lastSyncAt: due }, T0)).toBe(false);
  });
});

test('Google connection checks MEGA permission before opening consent',async()=>{
 const googleStart=jest.fn(); const navigate=jest.fn();
 const assertCanConnect=()=>{throw new Error('Parent approval required');};
 await expect(connectGoogle(['gmail'],{googleStart,googleConnectCode:jest.fn(),navigate,assertCanConnect} as never)).rejects.toThrow('Parent approval required');
 expect(googleStart).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
});
