// G5 pages: Settings (boards Settings / SettingsAdult / SettingsKid, the theme / wallpaper / notifications sheets),
// Rules and limits (ProfileRules / ProfileRulesKid), Activity (ProfileActivity), and the HQ tile room (board HQ).
import { act, fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';
import { G5_UI_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SettingsContent, accentText, loudText, wallpaperText, type SettingsContentProps } from './SettingsContent';
import { NotifySheet, ThemeSheet } from './SettingsSheets';
import { RulesContent, minutesText, type KidControls } from './RulesContent';
import { ActivityContent, dayLabel, filterOf } from './ActivityContent';
import { clockLabel, shiftClock } from './rows';
import { HqRoom, targetTiles, type RoomMega } from '@/features/hq/HqRoom';
import { HQ_LAYOUT, isWalkable, route } from '@/features/hq/hqLayout';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const press = (el: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(el);
  });
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const inSafeArea = (ui: ReactElement, role?: 'kid' | 'adult' | 'admin') => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>, { role });
const NOTIFY = { loudKinds: ['reminder' as const, 'request' as const], quietHours: { start: '22:00', end: '07:00' }, dailyCap: 6 };
const T0 = Date.UTC(2026, 9, 29, 18, 0);

const settings = (over: Partial<SettingsContentProps> = {}): SettingsContentProps => ({
  role: 'admin',
  megaName: 'Teal',
  theme: 'midnight',
  accent: 'theme',
  accentHex: '#2FB8B0',
  wallpaper: { kind: 'preset', id: 'glow' },
  notify: NOTIFY,
  email: 'admin@example.com',
  parentCode: '48217',
  memberCount: 5,
  connectedCount: 2,
  on: { openTheme: jest.fn(), openWallpaper: jest.fn(), openNotify: jest.fn(), openMembers: jest.fn(), openAccounts: jest.fn(), openPlaces: jest.fn(), signOut: jest.fn() },
  ...over,
});

describe('Settings (boards Settings / SettingsAdult / SettingsKid)', () => {
  test('admin: Look, Notifications, Family (parent code hidden until Show), Connected accounts, Account', async () => {
    const p = settings();
    await renderWithTheme(<SettingsContent {...p} />);
    expect(screen.getByText('Midnight · Default color')).toBeTruthy();
    expect(screen.getByText('MEGA glow')).toBeTruthy();
    expect(screen.getByText('Reminders, requests')).toBeTruthy();
    expect(screen.getByText('10:00 PM – 7:00 AM')).toBeTruthy();
    expect(screen.getByText(G5_UI_COPY.familyNote)).toBeTruthy();
    expect(screen.getByText(G5_UI_COPY.parentCodeHidden)).toBeTruthy();
    await press(screen.getByLabelText(G5_UI_COPY.showCodeLabel));
    expect(screen.getByText('4 8 2 1 7')).toBeTruthy();
    await press(screen.getByLabelText(`${G5_UI_COPY.connectedAccounts}, 2 connected`));
    expect(p.on.openAccounts).toHaveBeenCalled();
    await press(screen.getByLabelText(G5_UI_COPY.signOut));
    expect(p.on.signOut).toHaveBeenCalled();
  });

  test('adult: no Family section (it’s the admin’s), still Connected accounts', async () => {
    await renderWithTheme(<SettingsContent {...settings({ role: 'adult', parentCode: null })} />);
    expect(screen.queryByText(G5_UI_COPY.parentCode)).toBeNull();
    expect(screen.getAllByText(G5_UI_COPY.connectedAccounts).length).toBeGreaterThan(0);
  });

  test('kid: notifications locked "Set by a parent", no accounts, "Switch person"', async () => {
    const p = settings({ role: 'kid', email: null });
    await renderWithTheme(<SettingsContent {...p} />, { role: 'kid' });
    expect(screen.getAllByText(G5_UI_COPY.setByParent)).toHaveLength(2);
    expect(screen.getByText(G5_UI_COPY.kidNotifyNote)).toBeTruthy();
    expect(screen.queryByText(G5_UI_COPY.connectedAccounts)).toBeNull();
    await press(screen.getByLabelText(G5_UI_COPY.switchPerson));
    expect(p.on.signOut).toHaveBeenCalled();
  });

  test('value words', () => {
    expect(accentText('mega', 'Zap')).toBe('Matches Zap');
    expect(accentText({ hex: '#123456' }, 'Zap')).toBe(G5_UI_COPY.accentCustom);
    expect(wallpaperText(null, 'Zap')).toBe(G5_UI_COPY.wallpaperNone);
    expect(wallpaperText({ kind: 'photo' }, 'Zap')).toBe(G5_UI_COPY.wallpaperPhoto);
    expect(loudText([])).toBe(G5_UI_COPY.wakesNone);
    expect(clockLabel('00:30')).toBe('12:30 AM');
    expect(clockLabel('12:00')).toBe('12:00 PM');
    expect(shiftClock('23:30', 60)).toBe('00:30');
    expect(shiftClock('00:00', -30)).toBe('23:30');
  });
});

describe('Settings sheets', () => {
  test('theme: picking a theme and an accent saves them', async () => {
    const onTheme = jest.fn();
    const onAccent = jest.fn();
    await inSafeArea(<ThemeSheet open onClose={() => {}} theme="midnight" accent="theme" megaName="Teal" megaHex="#2FB8B0" megaSticker="none" onTheme={onTheme} onAccent={onAccent} />);
    await press(screen.getByLabelText('Light'));
    expect(onTheme).toHaveBeenCalledWith('light');
    await press(screen.getByLabelText('Match Teal'));
    expect(onAccent).toHaveBeenCalledWith('mega');
    await press(screen.getByLabelText('Coral'));
    expect(onAccent).toHaveBeenCalledWith({ hex: '#F2766B' });
  });

  test('notifications: wakes the phone switches, quiet hours by 30 minutes, the daily limit within bounds', async () => {
    const onChange = jest.fn();
    await inSafeArea(<NotifySheet open onClose={() => {}} notify={NOTIFY} onChange={onChange} />);
    await press(screen.getByLabelText('Tips'));
    expect(onChange).toHaveBeenLastCalledWith({ ...NOTIFY, loudKinds: ['reminder', 'request', 'tip'] });
    await press(screen.getByLabelText('Later: Quiet from'));
    expect(onChange).toHaveBeenLastCalledWith({ ...NOTIFY, quietHours: { start: '22:30', end: '07:00' } });
    await press(screen.getByLabelText('More: Daily limit'));
    expect(onChange).toHaveBeenLastCalledWith({ ...NOTIFY, dailyCap: 7 });
  });
});

const CONTROLS = {
  homeworkMode: true,
  quietHours: { start: '20:30', end: '07:00' },
  dailyMinutes: 60,
  blockedTopics: ['Scary videos', 'Weapons'],
  tellsParents: { safety: true as const, blockedSearches: true, summary: 'weekly' as const },
  parentsCanReadChat: false,
  webSearch: true,
} satisfies KidControls;

describe('Rules and limits (boards ProfileRules / ProfileRulesKid)', () => {
  test('a parent edits: switches, the summary segment, the time limit stepper; every change is a patch', async () => {
    const onPatch = jest.fn();
    await renderWithTheme(<RulesContent controls={CONTROLS} kidName="Twin 1" mega={{ name: 'Zap', hex: '#8E6CE0', sticker: 'none' }} parents="Admin and Partner" editable onPatch={onPatch} />);
    expect(screen.getByText('Twin 1 · Zap')).toBeTruthy();
    expect(screen.getByText('Only Admin and Partner can change these. Twin 1 can see them.')).toBeTruthy();
    await press(screen.getByLabelText(G5_UI_COPY.rulesWebSearch));
    expect(onPatch).toHaveBeenLastCalledWith({ webSearch: false });
    await press(screen.getByLabelText('Summary: Daily'));
    expect(onPatch).toHaveBeenLastCalledWith({ tellsParents: { ...CONTROLS.tellsParents, summary: 'daily' } });
    await press(screen.getByLabelText(`More minutes: ${G5_UI_COPY.rulesTimeLimit}`));
    expect(onPatch).toHaveBeenLastCalledWith({ dailyMinutes: 75 });
    expect(screen.getByTestId('chip-line')).toBeTruthy();
  });

  test('the kid’s version: same rows, read-only, each "Set by a parent"', async () => {
    await renderWithTheme(<RulesContent controls={CONTROLS} kidName="Twin 1" mega={null} parents="Admin" editable={false} onPatch={() => {}} />, { role: 'kid' });
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.getAllByText(G5_UI_COPY.setByParent).length).toBeGreaterThanOrEqual(6);
    expect(minutesText(0)).toBe(G5_UI_COPY.rulesNoLimit);
  });
});

describe('Activity (board ProfileActivity)', () => {
  const items = [
    { at: T0 - 60_000, type: 'calendar.changed', summary: 'Added Picture day to your private calendar' },
    { at: T0 - 120_000, type: 'reminder.due', summary: 'Reminded Twin 2 about dishes' },
    { at: T0 - 30 * 3_600_000, type: 'notification.answered', summary: 'You approved the pickup swap' },
    { at: T0 - 5_000, type: 'clock.tick', summary: 'tick' },
  ];
  const memory = { _id: 'mem1', text: 'Twin 1 is into dinosaurs' } as never;
  const props = { who: { viewerId: 'm_admin', names: {} }, items, memories: [memory], forgotten: [], megaName: 'Teal', now: T0, timeZone: 'America/New_York', canLoadMore: false, onLoadMore: () => {}, onOpenMemories: jest.fn() };

  test('grouped by day with times, bookkeeping hidden, filters narrow it, Forget on what it learned', async () => {
    const onFilter = jest.fn();
    const onForget = jest.fn();
    await renderWithTheme(<ActivityContent {...props} filter="all" onFilter={onFilter} onForget={onForget} />);
    expect(screen.getByText('TODAY')).toBeTruthy();
    expect(screen.getByText('YESTERDAY')).toBeTruthy();
    expect(screen.queryByText('tick')).toBeNull();
    await press(screen.getByLabelText('Calendar'));
    expect(onFilter).toHaveBeenCalledWith('calendar');
    await press(screen.getByLabelText('Forget: Twin 1 is into dinosaurs'));
    expect(onForget).toHaveBeenCalledWith('mem1');
  });

  test('a filter shows only its kind; a forgotten memory says so', async () => {
    await renderWithTheme(<ActivityContent {...props} forgotten={['mem1']} filter="calendar" onFilter={() => {}} onForget={() => {}} />);
    expect(screen.getByText('Added Picture day to your private calendar')).toBeTruthy();
    expect(screen.queryByText('Reminded Twin 2 about dishes')).toBeNull();
    expect(filterOf('job.changed')).toBeNull();
    expect(dayLabel(T0, T0, 'America/New_York')).toBe('Today');
  });
});

describe('HQ room (board HQ)', () => {
  const megas: RoomMega[] = [
    { megaId: 'teal', name: 'Teal', hex: '#2FB8B0', sticker: 'none', station: 'desk', label: 'Math homework', busy: true, mine: true, ownerId: 'm_admin' },
    { megaId: 'coral', name: 'Coral', hex: '#F2766B', sticker: 'none', station: 'desk', label: 'Busy', busy: true, mine: false, ownerId: 'm_partner' },
    { megaId: 'zap', name: 'Zap', hex: '#8E6CE0', sticker: 'none', station: 'rug', label: 'Playing', busy: false, mine: false, ownerId: 'm_twin1' },
  ];
  const room = (on: Partial<Parameters<typeof HqRoom>[0]> = {}) =>
    renderWithTheme(<HqRoom megas={megas} doors={[{ memberId: 'm_admin', name: 'Admin', mine: true }]} narration="Teal is at the desk." width={320} onTalk={jest.fn()} onDetails={jest.fn()} onVisitRoom={jest.fn()} onPlaceAction={jest.fn()} {...on} />);

  test('every station is reachable from the charger, and two MEGAs never share a tile', () => {
    for (const s of Object.values(HQ_LAYOUT.stations)) {
      expect(isWalkable(s.tile)).toBe(true);
      expect(route(HQ_LAYOUT.stations.charger.tile, s.tile)).not.toBeNull();
    }
    const t = targetTiles(megas);
    expect(`${t.teal}`).not.toBe(`${t.coral}`);
  });

  test('tap your MEGA → its status with Talk / Details; someone else’s → Visit room', async () => {
    const onTalk = jest.fn();
    const onVisitRoom = jest.fn();
    await room({ onTalk, onVisitRoom });
    expect(screen.getByText('Teal is at the desk.')).toBeTruthy();
    await press(screen.getByLabelText(/^Teal, /));
    await press(screen.getByText(G5_UI_COPY.talk));
    expect(onTalk).toHaveBeenCalled();
    await press(screen.getByLabelText(/^Zap, /));
    await press(screen.getByText(G5_UI_COPY.visitRoom));
    expect(onVisitRoom).toHaveBeenCalledWith('m_twin1');
  });

  test('tap a station → what happens there and its shortcut; a door → that room', async () => {
    const onPlaceAction = jest.fn();
    const onVisitRoom = jest.fn();
    await room({ onPlaceAction, onVisitRoom });
    await press(screen.getByLabelText('Fridge'));
    expect(screen.getByText(G5_UI_COPY.stationText.fridge)).toBeTruthy();
    await press(screen.getByText(G5_UI_COPY.openLists));
    expect(onPlaceAction).toHaveBeenCalledWith('fridge');
    await press(screen.getByLabelText(G5_UI_COPY.yourRoom));
    expect(onVisitRoom).toHaveBeenCalledWith('m_admin');
  });
});
