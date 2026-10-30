import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SharingContent } from './SharingContent';

test('sharing changes are explicit and retain the choice after a failed save', async () => {
  const onSave = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  await renderWithTheme(<SharingContent sharing={{ schedule: 'family', lists: 'family', hqActivity: 'family' }} onSave={onSave} />);
  await fireEvent.press(screen.getByLabelText('Schedule: Only me'));
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => { await fireEvent.press(screen.getByText('Save sharing preferences')); });
  expect(screen.getByLabelText('Schedule: Only me').props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('alert')).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByText('Save sharing preferences')); });
  expect(onSave).toHaveBeenLastCalledWith({ schedule: 'me', lists: 'family', hqActivity: 'family' });
  expect(screen.getByText('Sharing preferences saved.')).toBeTruthy();
});
