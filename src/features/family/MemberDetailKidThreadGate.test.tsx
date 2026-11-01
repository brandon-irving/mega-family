// G6 walkthrough defect #1 (P0): tapping your OWN member card in the Family tab crashed the app with an
// uncaught `ConvexError FORBIDDEN` from `family:kidThread`. `memberDetail.canReadChat` is `true` for a
// self-match (a different concern) *and* for a parent reading a kid's chat, but the route used to fire
// `useKidThread` whenever it was true at all, including for yourself — and `convex/family.ts`'s
// `kidThread` throws FORBIDDEN because you're never your own parent. The fix only subscribes when the
// viewer is actually this member's parent (shared/domain/family.ts `canReadKidThread`, the same rule the
// backend enforces), never from `canReadChat` alone.
import { screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import MemberDetailRoute from '@/app/family/[memberId]';

jest.mock('@/features/family/AssistantBriefPanel', () => ({ AssistantBriefPanel: () => null }));

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ memberId: 'members_admin' }) }));

// Stands in for the real `family:kidThread` query: it would throw FORBIDDEN for anyone the viewer isn't
// a parent of (exactly what crashed the app), so a non-null call here is the bug reproduced.
let mockParent = false;
const mockUseKidThread = jest.fn((id: string | null) => {
  if (id !== null && !mockParent) throw new Error('simulated ConvexError FORBIDDEN: kidThread called for a member the viewer is not a parent of');
  return { results: [], status: 'Exhausted' };
});

jest.mock('@/data/useFamily', () => ({
  useMemberDetail: () => ({
    member: { _id: 'members_admin', name: 'Admin', role: 'admin', joinedAt: 1 },
    mega: null,
    relationshipToViewer: null,
    kidControls: mockParent ? { parentsCanReadChat: true } : null,
    // The real backend reports this `true` for a self-match too — the route must not treat that alone
    // as "safe to read this member's kid thread".
    canReadChat: true,
  }),
  useSetKidControls: () => jest.fn(),
  useKidThread: (id: string | null) => mockUseKidThread(id),
}));
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ member: { _id: 'members_admin', role: 'admin' }, isParentOf: mockParent ? ['members_admin'] : [] }) }));
jest.mock('@/data/useMegaDirectory', () => ({ useMegaDirectory: () => ({}) }));
jest.mock('@/features/family/MemberDetailContent', () => ({ MemberDetailContent: () => null }));

describe('Family tab: tapping your own member card (G6 walkthrough #1, P0)', () => {
  beforeEach(() => { mockParent = false; jest.clearAllMocks(); });
  test('never subscribes to kidThread for yourself, even though canReadChat is true for a self-match', async () => {
    await renderWithTheme(<MemberDetailRoute />);
    expect(mockUseKidThread).toHaveBeenCalledWith(null);
    expect(screen.queryByText('THEIR CHAT (READ-ONLY)')).toBeNull();
  });
  test('an allowed child chat has its own viewport outside every plain ScrollView', async () => {
    mockParent = true;
    await renderWithTheme(<MemberDetailRoute />);
    const viewport = screen.getByTestId('kid-thread-viewport');
    expect(viewport.props.style.flex).toBe(1);
    for (let ancestor = viewport.parent; ancestor; ancestor = ancestor.parent) {
      expect(ancestor.type).not.toBe(ScrollView);
    }
    expect(mockUseKidThread).toHaveBeenCalledWith('members_admin');
  });
});
