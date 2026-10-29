// G5 UX review (Oct 29, finding 4 + the frontend's own gap): a kid's Settings didn't say whether their parents
// can read their chats (the Oct 25 spec: quiet hours, time limit and "Your parents can read your chats", all
// read-only), and the kid's read-only Rules page (board ProfileRulesKid) had no way in. Now Settings shows the
// line and a Rules and limits row, the kid's MEGA profile has the row too, and /mega-profile/rules shows their
// rules locked ("Set by a parent"). Data: `kidControls.mine` (CONTRACT v0.17b, pending); without it the line
// and rows stay hidden rather than guessing.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { G5_FIX_COPY, G5_UI_COPY as U } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SettingsContent, type SettingsContentProps } from './SettingsContent';
import { ProfileContent } from '@/features/profile/ProfileContent';
import KidRulesRoute from '@/app/mega-profile/rules';

const mockRole = { current: 'kid' as 'kid' | 'admin' };
const mockMine = { current: null as unknown };
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return { Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>, router: { back: jest.fn(), push: jest.fn() } };
});
jest.mock('@/data/useViewer', () => ({
  useViewer: () => ({ member: { _id: 'm_twin1', name: 'Twin 1', role: mockRole.current }, mega: { _id: 'mg', name: 'Zap', look: { hex: '#8E6CE0', sticker: 'bolt' } }, family: { timezone: 'America/New_York' } }),
}));
jest.mock('@/data/useFamily', () => ({ useMyRules: () => mockMine.current }));

const press = (el: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(el);
  });

const CONTROLS = {
  _id: 'kc_1',
  _creationTime: 0,
  familyId: 'f',
  memberId: 'm_twin1',
  homeworkMode: true,
  quietHours: { start: '20:30', end: '07:00' },
  dailyMinutes: 60,
  blockedTopics: [],
  tellsParents: { safety: true, blockedSearches: true, summary: 'weekly' },
  parentsCanReadChat: true,
  webSearch: true,
};

const kidSettings = (over: Partial<SettingsContentProps> = {}): SettingsContentProps => ({
  role: 'kid',
  megaName: 'Zap',
  theme: 'midnight',
  accent: 'mega',
  accentHex: '#2FB8B0',
  wallpaper: null,
  notify: { loudKinds: ['reminder'], quietHours: { start: '20:30', end: '07:00' }, dailyCap: 4 },
  email: null,
  parentCode: null,
  on: { openTheme: jest.fn(), openWallpaper: jest.fn(), openNotify: jest.fn(), openMembers: jest.fn(), openAccounts: jest.fn(), openPlaces: jest.fn(), signOut: jest.fn() },
  ...over,
});

describe('kid Settings', () => {
  test('says, read-only, that their parents can read their chats, and opens their rules', async () => {
    const openRules = jest.fn();
    const props = kidSettings({ parentsCanReadChat: true });
    await renderWithTheme(<SettingsContent {...props} on={{ ...props.on, openRules }} />);
    expect(screen.getByText(G5_FIX_COPY.kidReadChats)).toBeTruthy();
    await press(screen.getByText(U.rulesRow));
    expect(openRules).toHaveBeenCalledTimes(1);
  });

  test('when the server can’t say yet, the line stays hidden (never guessed)', async () => {
    await renderWithTheme(<SettingsContent {...kidSettings()} />);
    expect(screen.queryByText(G5_FIX_COPY.kidReadChats)).toBeNull();
  });
});

describe('kid MEGA profile', () => {
  test('has a Rules and limits row', async () => {
    const onOpenRules = jest.fn();
    await renderWithTheme(
      <ProfileContent
        mega={{ _id: 'mg', name: 'Zap', look: { hex: '#8E6CE0', sticker: 'bolt' }, personality: 'cheerful' } as never}
        role="kid"
        isAdmin={false}
        statusLine=""
        onRename={jest.fn()}
        onOpenLookPersonality={jest.fn()}
        onOpenNotifications={jest.fn()}
        onOpenTheme={jest.fn()}
        onOpenSettings={jest.fn()}
        onOpenRules={onOpenRules}
      />,
    );
    await press(screen.getByText(U.rulesRow));
    expect(onOpenRules).toHaveBeenCalledTimes(1);
  });
});

describe('/mega-profile/rules (board ProfileRulesKid)', () => {
  test('a kid sees their rules, each locked "Set by a parent"', async () => {
    mockRole.current = 'kid';
    const { _id, _creationTime, familyId, memberId, ...fields } = CONTROLS;
    void [_id, _creationTime, familyId, memberId];
    mockMine.current = { ...fields, dailyCap: 3, parents: ['Admin', 'Partner'] };
    await renderWithTheme(<KidRulesRoute />);
    expect(screen.getAllByText(U.setByParent).length).toBeGreaterThan(0);
    // v0.17b reconcile: the server's shape (`kidControls.mine`: the control fields + dailyCap + parents) —
    // the intro names the parents and the locked buzz row shows the cap.
    expect(screen.getByText(/Admin and Partner/)).toBeTruthy();
    expect(screen.getByText(G5_FIX_COPY.buzzesTitle)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  test('an adult is sent back to chat', async () => {
    mockRole.current = 'admin';
    await renderWithTheme(<KidRulesRoute />);
    expect(screen.getByText('redirect:/chat')).toBeTruthy();
  });
});
