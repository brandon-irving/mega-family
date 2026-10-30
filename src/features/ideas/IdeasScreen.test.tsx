import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ERROR_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { IdeasScreen, type Idea } from './IdeasScreen';

const mockUseIdeas = jest.fn();
const mockRefresh = jest.fn();
const mockSave = jest.fn();
const mockDismiss = jest.fn();
const mockCategorize = jest.fn();
const mockGiftCard = jest.fn();
const mockLoadMore = jest.fn();

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/data/useIdeas', () => ({
  useIdeas: (args: unknown) => mockUseIdeas(args),
  useRefreshGiftIdeas: () => mockRefresh,
  useSetIdeaSaved: () => mockSave,
  useDismissIdea: () => mockDismiss,
  useCategorizeIdea: () => mockCategorize,
}));
jest.mock('@/features/calendar/GiftsCard', () => ({ GiftsCard: (props: unknown) => { mockGiftCard(props); return null; } }));

const IDEA: Idea = {
  _id: 'idea1' as never, _creationTime: 1, familyId: 'family1' as never, ownerId: 'member1' as never,
  title: 'Museum afternoon', text: 'Try the science museum after lunch. Bring a snack for the journey home.',
  category: 'activities', source: { kind: 'message', messageId: 'message1' as never }, sourceKey: 'message:message1',
  saved: false, dismissed: false, at: 1, searchText: 'museum afternoon science', audience: 'Only you',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseIdeas.mockReturnValue({ results: [IDEA], status: 'CanLoadMore', loadMore: mockLoadMore });
  mockRefresh.mockResolvedValue(null);
  mockSave.mockResolvedValue(null);
  mockDismiss.mockResolvedValue(null);
  mockCategorize.mockResolvedValue(null);
});

test('refreshes gifts once, debounces search, combines filters, and loads only one next page', async () => {
  jest.useFakeTimers();
  try {
    await renderWithTheme(<IdeasScreen />);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText('Search ideas'), 'museum');
    expect(mockUseIdeas).toHaveBeenLastCalledWith({ sort: 'newest', category: undefined, saved: undefined, search: undefined });
    await act(async () => jest.advanceTimersByTime(249));
    expect(mockUseIdeas).toHaveBeenLastCalledWith({ sort: 'newest', category: undefined, saved: undefined, search: undefined });
    await act(async () => jest.advanceTimersByTime(1));
    await fireEvent.press(screen.getByLabelText('Filter and sort ideas'));
    await fireEvent.press(screen.getByLabelText('Activities'));
    await fireEvent.press(screen.getByLabelText('Saved'));
    expect(mockUseIdeas).toHaveBeenLastCalledWith({ sort: 'newest', category: 'activities', saved: true, search: 'museum' });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Show ideas'));
    await fireEvent.press(screen.getByLabelText('Load more ideas'));
    expect(mockLoadMore).toHaveBeenCalledWith(20);
  } finally { jest.useRealTimers(); }
});

test('shows the original audience and recovers from a failed save without hiding the idea', async () => {
  mockSave.mockRejectedValueOnce(new Error('offline'));
  await renderWithTheme(<IdeasScreen />);
  expect(screen.getByText('Only you')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Save Museum afternoon'));
  await waitFor(() => expect(screen.getByText(ERROR_COPY.default)).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Save Museum afternoon'));
  await waitFor(() => expect(screen.queryByText(ERROR_COPY.default)).toBeNull());
  expect(mockSave).toHaveBeenLastCalledWith({ ideaId: IDEA._id, saved: true });
  expect(screen.getByLabelText('Open idea: Museum afternoon')).toBeTruthy();
});

test('opens the full suggestion, supports categorization, and returns to its exact Chat source', async () => {
  await renderWithTheme(<IdeasScreen />);
  await fireEvent.press(screen.getByLabelText('View Museum afternoon'));
  expect(screen.getByTestId('idea-detail')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Move idea to Meals'));
  await waitFor(() => expect(mockCategorize).toHaveBeenCalledWith({ ideaId: IDEA._id, category: 'meals' }));
  await fireEvent.press(screen.getByLabelText('Open source in Chat'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/chat/[messageId]', params: { messageId: 'message1' } });
  expect(screen.queryByTestId('idea-detail')).toBeNull();
});

test('dismissal is a backed action and closes the detail only after success', async () => {
  mockDismiss.mockRejectedValueOnce(new Error('offline'));
  await renderWithTheme(<IdeasScreen />);
  await fireEvent.press(screen.getByLabelText('View Museum afternoon'));
  await fireEvent.press(screen.getByLabelText('Dismiss idea'));
  await waitFor(() => expect(screen.getByText(ERROR_COPY.default)).toBeTruthy());
  expect(screen.getByTestId('idea-detail')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Dismiss idea'));
  await waitFor(() => expect(screen.queryByTestId('idea-detail')).toBeNull());
  expect(mockDismiss).toHaveBeenLastCalledWith({ ideaId: IDEA._id });
});

test('gift details retain the existing gift actions and cannot change category or broaden sharing', async () => {
  const gift: Idea = { ...IDEA, category: 'gifts', audience: 'Adults except Jordan', source: { kind: 'gift', giftIdeasId: 'gifts1' as never, index: 1 } };
  mockUseIdeas.mockReturnValue({ results: [gift], status: 'Exhausted', loadMore: mockLoadMore });
  await renderWithTheme(<IdeasScreen />);
  await fireEvent.press(screen.getByLabelText('View Museum afternoon'));
  expect(mockGiftCard).toHaveBeenLastCalledWith({ giftIdeasId: 'gifts1', megaName: 'MEGA', selectedIndex: 1 });
  expect(screen.queryByLabelText('Move idea to Meals')).toBeNull();
  expect(screen.queryByLabelText('Open source in Chat')).toBeNull();
  expect(screen.queryByText('Share')).toBeNull();
});

test('empty filters can be cleared, and refresh failures have a retry action', async () => {
  mockUseIdeas.mockReturnValue({ results: [], status: 'Exhausted', loadMore: mockLoadMore });
  mockRefresh.mockRejectedValueOnce(new Error('offline'));
  await renderWithTheme(<IdeasScreen />);
  await waitFor(() => expect(screen.getByLabelText('Retry gift refresh')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Retry gift refresh'));
  await waitFor(() => expect(screen.queryByLabelText('Retry gift refresh')).toBeNull());
  await fireEvent.press(screen.getByLabelText('Filter and sort ideas'));
  await fireEvent.press(screen.getByLabelText('Saved'));
  await fireEvent.press(screen.getByLabelText('Show ideas'));
  expect(screen.getByText('No matching ideas')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Clear filters'));
  expect(screen.getByText('A place for good ideas')).toBeTruthy();
  expect(mockUseIdeas).toHaveBeenLastCalledWith({ sort: 'newest', category: undefined, saved: undefined, search: undefined });
});
