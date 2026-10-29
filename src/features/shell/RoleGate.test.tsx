// G5 UX review (Oct 29, finding 2): a kid who opened /accounts directly got the whole adult Connected-accounts
// page with a live "Add a schedule link" button. Every adult-only G5 route now sends a kid back to /chat, the
// way /homework already did (and the server refuses the calls anyway). Activity is the admin's alone.
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import AccountsRoute from '@/app/accounts';
import RulesRoute from '@/app/rules/[memberId]';
import ActivityRoute from '@/app/mega-profile/activity';
import SearchesRoute from '@/app/searches/[memberId]';

const mockRole = { current: 'kid' as 'kid' | 'adult' | 'admin' };
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => false },
    useLocalSearchParams: () => ({ memberId: 'members_twin1' }),
  };
});
jest.mock('@/data/useViewer', () => ({
  useViewer: () => ({ member: { _id: 'members_x', role: mockRole.current }, mega: null, family: { timezone: 'America/New_York' } }),
}));

const ROUTES = [
  ['/accounts', AccountsRoute],
  ['/rules/[memberId]', RulesRoute],
  ['/mega-profile/activity', ActivityRoute],
  ['/searches/[memberId]', SearchesRoute],
] as const;

describe('adult-only G5 routes', () => {
  test.each(ROUTES)('a kid who opens %s is sent back to chat', async (_path, Route) => {
    mockRole.current = 'kid';
    await renderWithTheme(<Route />);
    expect(screen.getByText('redirect:/chat')).toBeTruthy();
  });

  test('Activity is the admin’s: another adult is sent back to chat too', async () => {
    mockRole.current = 'adult';
    await renderWithTheme(<ActivityRoute />);
    expect(screen.getByText('redirect:/chat')).toBeTruthy();
  });
});
