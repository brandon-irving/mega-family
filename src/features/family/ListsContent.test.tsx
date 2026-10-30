import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ListsContent } from './ListsContent';

jest.mock('@/ui/ModalSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  return { ModalSheet: ({ children, open, onClose }: { children: React.ReactNode; open: boolean; onClose: () => void }) => open ? <><Pressable accessibilityRole="button" accessibilityLabel="Close new list" onPress={onClose}><Text>Close</Text></Pressable>{children}</> : null };
});

test('an empty Lists screen can create a private list and retain a failed draft', async () => {
  const onCreateList = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('list_1');
  await renderWithTheme(<ListsContent lists={[]} onAddItem={jest.fn()} onCheckItem={jest.fn()} onRemoveItem={jest.fn()} onCreateList={onCreateList} />);
  await fireEvent.press(screen.getByText('New list'));
  await fireEvent.changeText(screen.getByLabelText('List name'), 'Weekend plans');
  await fireEvent.press(screen.getByText('Only me'));
  await act(async () => { await fireEvent.press(screen.getByText('Create list')); });
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('List name').props.value).toBe('Weekend plans');
  await act(async () => { await fireEvent.press(screen.getByText('Create list')); });
  expect(onCreateList).toHaveBeenLastCalledWith('Weekend plans', 'personal');
  expect(screen.queryByLabelText('List name')).toBeNull();
});

test('an item draft clears only after add succeeds and check/remove have full-row controls', async () => {
  const onAddItem = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const onCheckItem = jest.fn();
  const onRemoveItem = jest.fn();
  await renderWithTheme(<ListsContent lists={[{ list: { _id: 'list_1', name: 'Groceries', scope: 'family' }, items: [{ _id: 'item_1', text: 'Apples', checked: false }] } as never]} onAddItem={onAddItem} onCheckItem={onCheckItem} onRemoveItem={onRemoveItem} />);
  await fireEvent.changeText(screen.getByLabelText('Add item to Groceries'), 'Milk');
  await act(async () => { await fireEvent.press(screen.getByLabelText('Add to Groceries')); });
  expect(screen.getByLabelText('Add item to Groceries').props.value).toBe('Milk');
  await act(async () => { await fireEvent.press(screen.getByLabelText('Add to Groceries')); });
  expect(screen.getByLabelText('Add item to Groceries').props.value).toBe('');
  await act(async () => { await fireEvent.press(screen.getByRole('checkbox', { name: 'Apples' })); });
  expect(onCheckItem).toHaveBeenCalledWith('item_1', true);
  await act(async () => { await fireEvent.press(screen.getByLabelText('Remove Apples')); });
  expect(onRemoveItem).toHaveBeenCalledWith('item_1');
});

test('finishing a dismissed list creation does not close a new draft', async () => {
  let finish!: () => void;
  const onCreateList = jest.fn().mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  await renderWithTheme(<ListsContent lists={[]} onAddItem={jest.fn()} onCheckItem={jest.fn()} onRemoveItem={jest.fn()} onCreateList={onCreateList} />);
  await fireEvent.press(screen.getByText('New list'));
  await fireEvent.changeText(screen.getByLabelText('List name'), 'First list');
  await fireEvent.press(screen.getByText('Create list'));
  await fireEvent.press(screen.getByLabelText('Close new list'));
  await fireEvent.press(screen.getByText('New list'));
  await fireEvent.changeText(screen.getByLabelText('List name'), 'Second list');
  await act(async () => { finish(); });
  expect(screen.getByLabelText('List name').props.value).toBe('Second list');
});
