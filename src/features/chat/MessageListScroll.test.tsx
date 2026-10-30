import { act } from '@testing-library/react-native';
import type { Id } from '@shared/domain/validators';
import { MESSAGES_BY_TYPE } from '@/test/fixtures';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { MessageList } from './MessageList';

type Failure = { index: number; averageItemLength: number; highestMeasuredFrameIndex: number };
const mockScrollToIndex = jest.fn();
const mockScrollToOffset = jest.fn();
let mockFailure: (info: Failure) => void;

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return Object.defineProperty(Object.create(actual), 'FlatList', {
    value: React.forwardRef(function MockList(props: { onScrollToIndexFailed: typeof mockFailure }, ref: unknown) {
      mockFailure = props.onScrollToIndexFailed;
      React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex, scrollToOffset: mockScrollToOffset }));
      return null;
    }),
  });
});
jest.mock('./MessageRow', () => ({ MessageRow: () => null }));

const isMine = () => false;
const target = MESSAGES_BY_TYPE.notice;
const messages = [MESSAGES_BY_TYPE.text, target];
const props = { messages, isMine, megaById: {}, scrollToMessageId: target._id };

beforeEach(() => {
  jest.useFakeTimers();
  mockScrollToIndex.mockReset();
  mockScrollToOffset.mockReset();
});
afterEach(() => jest.useRealTimers());

test('an unmeasured deep-link target advances the render window and stops retrying after three retries', async () => {
  mockScrollToIndex.mockImplementation(({ index }: { index: number }) => mockFailure({ index, averageItemLength: 100, highestMeasuredFrameIndex: 0 }));
  const view = await renderWithTheme(<MessageList {...props} />);
  await act(async () => jest.advanceTimersByTime(10_000));
  expect(mockScrollToIndex).toHaveBeenCalledTimes(4);
  expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 100, animated: false });
  await view.unmount();
});

test('unmount cancels a scheduled scroll retry', async () => {
  const schedule = jest.spyOn(global, 'setTimeout');
  const cancel = jest.spyOn(global, 'clearTimeout');
  mockScrollToIndex.mockImplementation(({ index }: { index: number }) => mockFailure({ index, averageItemLength: 100, highestMeasuredFrameIndex: 0 }));
  const view = await renderWithTheme(<MessageList {...props} />);
  const retryIndex = schedule.mock.calls.findIndex(([, delay]) => delay === 100);
  expect(retryIndex).toBeGreaterThanOrEqual(0);
  const retryTimer = schedule.mock.results[retryIndex].value;
  await view.unmount();
  expect(cancel).toHaveBeenCalledWith(retryTimer);
  schedule.mockRestore();
  cancel.mockRestore();
});

test('streamed message updates do not repeatedly scroll a deep-link target that was already reached', async () => {
  const view = await renderWithTheme(<MessageList {...props} />);
  const update = { ...MESSAGES_BY_TYPE.text, _id: 'new' as Id<'messages'> };
  await view.rerender(<ThemeProvider><MessageList {...props} messages={[update, ...messages]} /></ThemeProvider>);
  expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
  await view.unmount();
});

test('a pending retry finds the target again after incoming messages shift its index', async () => {
  mockScrollToIndex.mockImplementationOnce(({ index }: { index: number }) => mockFailure({ index, averageItemLength: 100, highestMeasuredFrameIndex: 0 }));
  const view = await renderWithTheme(<MessageList {...props} />);
  const update = { ...MESSAGES_BY_TYPE.text, _id: 'new' as Id<'messages'> };
  await view.rerender(<ThemeProvider><MessageList {...props} messages={[update, ...messages]} /></ThemeProvider>);
  await act(async () => jest.advanceTimersByTime(100));
  expect(mockScrollToIndex).toHaveBeenLastCalledWith({ index: 2, viewPosition: 0.5, animated: true });
  await view.unmount();
});
