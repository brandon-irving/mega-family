// G5 UX review (Oct 29, finding 3), wiring: the chat's "Invite sent" card shows the real invite panel (not a
// "QR code" placeholder box), and an unjoined member's Family page has an Invite section with the same panel.
import { screen } from '@testing-library/react-native';
import { G5_FIX_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Block } from '@/features/chat/Blocks';
import MemberDetailRoute from '@/app/family/[memberId]';

jest.mock('@/features/family/AssistantBriefPanel', () => ({ AssistantBriefPanel: () => null }));

jest.mock('./InvitePanel', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return { InvitePanel: ({ memberId }: { memberId: string }) => <Text>{`invite-panel:${memberId}`}</Text> };
});
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ memberId: 'members_kid' }) }));
const mockJoinedAt = { current: undefined as number | undefined };
jest.mock('@/data/useFamily', () => ({
  useMemberDetail: () => ({
    member: { _id: 'members_kid', name: 'Twin 1', role: 'kid', joinedAt: mockJoinedAt.current, activities: [], hasMega: true },
    mega: null,
    relationshipToViewer: 'parent',
    kidControls: null,
    canReadChat: false,
  }),
  useSetKidControls: () => jest.fn(),
  useKidThread: () => ({ results: [], status: 'Exhausted' }),
}));
jest.mock('@/data/useMegaDirectory', () => ({ useMegaDirectory: () => ({}) }));
// G6 fix (P0, kidThread crash): the route now also reads the viewer's own isParentOf to decide whether
// it's safe to subscribe to kidThread (shared/domain/family.ts canReadKidThread) — not a parent here.
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ family: { timezone: 'America/New_York' }, member: { _id: 'members_admin', role: 'admin' }, isParentOf: [] }) }));
jest.mock('@/features/family/MemberDetailContent', () => ({ MemberDetailContent: () => null }));

describe('invite wiring', () => {
  test('the chat card renders the invite panel for its member, with no placeholder box', async () => {
    await renderWithTheme(<Block block={{ kind: 'invite', memberId: 'members_kid' as never }} onAnswer={jest.fn()} />);
    expect(screen.getByText('invite-panel:members_kid')).toBeTruthy();
    expect(screen.queryByText('QR code')).toBeNull();
  });

  test('an unjoined member’s page has an Invite section', async () => {
    mockJoinedAt.current = undefined;
    await renderWithTheme(<MemberDetailRoute />);
    expect(screen.getByText(G5_FIX_COPY.inviteTitle)).toBeTruthy();
    expect(screen.getByText('invite-panel:members_kid')).toBeTruthy();
  });

  test('a member who already joined has no Invite section', async () => {
    mockJoinedAt.current = 1;
    await renderWithTheme(<MemberDetailRoute />);
    expect(screen.queryByText('invite-panel:members_kid')).toBeNull();
  });
});
