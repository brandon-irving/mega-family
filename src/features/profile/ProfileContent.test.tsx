import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ProfileContent, type ProfileContentProps } from './ProfileContent';

const MEGA = { _id: 'megas_teal', name: 'Teal', look: { hex: '#2FB8B0', sticker: 'star', antenna: 'star' }, personality: 'calm' } as unknown as ProfileContentProps['mega'];
const props = (over: Partial<ProfileContentProps> = {}): ProfileContentProps => ({
  mega: MEGA, role: 'adult', statusLine: 'Available', isAdmin: false,
  sharing: { schedule: 'family', lists: 'me', hqActivity: 'partner' },
  onRename: jest.fn(), onOpenLookPersonality: jest.fn(), onOpenMemories: jest.fn(), onOpenSharing: jest.fn(),
  ...over,
});

test('compact profile has focused destinations without duplicate global settings rows', async () => {
  const p = props();
  await renderWithTheme(<ProfileContent {...p} />);
  await fireEvent.press(screen.getByLabelText('Look and personality'));
  await fireEvent.press(screen.getByLabelText('Memories'));
  await fireEvent.press(screen.getByLabelText('Privacy & sharing'));
  expect(p.onOpenLookPersonality).toHaveBeenCalledTimes(1);
  expect(p.onOpenMemories).toHaveBeenCalledTimes(1);
  expect(p.onOpenSharing).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Theme')).toBeNull();
  expect(screen.queryByText('Notifications and quiet hours')).toBeNull();
  expect(screen.queryByText('Only me')).toBeNull();
});

test('a kid keeps customization and read-only rules without memory, rename or sharing controls', async () => {
  const onOpenRules = jest.fn();
  await renderWithTheme(<ProfileContent {...props({ role: 'kid', onOpenRules, onOpenActivity: jest.fn() })} />, { role: 'kid' });
  expect(screen.queryByLabelText('Rename Teal')).toBeNull();
  expect(screen.queryByLabelText('Memories')).toBeNull();
  expect(screen.queryByLabelText('Privacy & sharing')).toBeNull();
  expect(screen.queryByLabelText('Activity')).toBeNull();
  expect(screen.getByLabelText('Look and personality')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Rules and limits'));
  expect(onOpenRules).toHaveBeenCalledTimes(1);
});

test('failed rename preserves the entered name and allows retry', async () => {
  const onRename = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  await renderWithTheme(<ProfileContent {...props({ onRename })} />);
  await fireEvent.press(screen.getByLabelText('Rename Teal'));
  await fireEvent.changeText(screen.getByLabelText('MEGA name'), 'Mint');
  await act(async () => { await fireEvent.press(screen.getByText('Save')); });
  expect(screen.getByLabelText('MEGA name').props.value).toBe('Mint');
  expect(screen.getByRole('alert')).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByText('Save')); });
  await waitFor(() => expect(screen.queryByLabelText('MEGA name')).toBeNull());
  expect(onRename).toHaveBeenCalledTimes(2);
});
