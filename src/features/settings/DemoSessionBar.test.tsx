import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FIXTURE_IDS } from '@/test/fixtures';
import { DemoSessionBar } from './DemoSessionBar';

const mockSwitch = jest.fn();
const mockReplace = jest.fn();
let mockMember: { _id: string } | null = { _id: FIXTURE_IDS.admin };
let mockProfile: { active: boolean; canResume: boolean; testing?: boolean; currentName?: string; pendingToken?: string; people?: { memberId: string; name: string }[] } | null;
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: (...args: unknown[]) => mockReplace(...args) }) }));
jest.mock('@/data/useDemoProfile', () => ({ useDemoProfile: () => ({ profile: mockProfile, switchTester: mockSwitch }) }));
jest.mock('@/data/useViewer', () => ({ useViewer: () => mockMember ? { member: mockMember } : null }));
jest.mock('@/features/shell/navigation', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) }, resetNavigationGuard: jest.fn() }));

beforeEach(() => { mockSwitch.mockReset().mockResolvedValue(null); mockReplace.mockReset(); mockMember = { _id: FIXTURE_IDS.admin }; mockProfile = null; });

test('ordinary profiles have no test controls', async () => {
  await renderWithTheme(<DemoSessionBar />);
  expect(screen.queryByText('Switch person')).toBeNull();
  expect(screen.queryByText('Back to admin')).toBeNull();
});

test('the parked admin resumes the pending invite only on the start screen', async () => {
  mockMember = null;
  mockProfile = { active: true, canResume: false, testing: true, pendingToken: 'test-token' };
  await renderWithTheme(<DemoSessionBar resumeInvite />);
  expect(mockReplace).toHaveBeenCalledWith('/join/test-token');
  await fireEvent.press(screen.getByText('Back to admin'));
  expect(mockSwitch).toHaveBeenCalledWith({ memberId: undefined, expectedMemberId: null });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/chat'));
});

test('failed return stays visible and can be retried', async () => {
  mockProfile = { active: true, canResume: false, testing: true, currentName: 'Jamie' };
  mockSwitch.mockRejectedValueOnce(new Error('offline'));
  await renderWithTheme(<DemoSessionBar />);
  await fireEvent.press(screen.getByText('Back to admin'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Back to admin'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/chat'));
});
