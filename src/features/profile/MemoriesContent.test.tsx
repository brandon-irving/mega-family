import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MemoriesContent } from './MemoriesContent';

test('memories exposes another page and keeps a failed forget actionable', async () => {
  const onLoadMore = jest.fn();
  const onForget = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  await renderWithTheme(<MemoriesContent memories={[{ _id: 'memory_1', text: 'Likes parks', scope: 'personal', kind: 'preference' } as never]} search="" onSearch={jest.fn()} onForget={onForget} status="CanLoadMore" onLoadMore={onLoadMore} />);
  await fireEvent.press(screen.getByText('Load more memories'));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  await act(async () => { await fireEvent.press(screen.getByLabelText('Forget: Likes parks')); });
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('Forget: Likes parks')).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByLabelText('Forget: Likes parks')); });
  expect(onForget).toHaveBeenCalledTimes(2);
});
