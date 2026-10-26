// PLAN §1 "Learnings": "Saved · Family" chip -> tap opens the sheet to change scope or forget.
// PLAN "MEGA profile": kids don't get sharing or memory controls, so their chips are read-only.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SAMPLE_SAVE_CHIP } from '@/test/fixtures';
import { SaveChip } from './SaveChip';

describe('SaveChip', () => {
  test('tapping the chip opens the scope sheet; picking a scope calls onChangeScope and closes it', async () => {
    const onChangeScope = jest.fn();
    const onForget = jest.fn();
    await renderWithTheme(<SaveChip chip={SAMPLE_SAVE_CHIP} onChangeScope={onChangeScope} onForget={onForget} />);

    await fireEvent.press(screen.getByLabelText('Saved, Family. Tap to change.'));
    expect(screen.getByText('Change scope')).toBeTruthy();

    await fireEvent.press(screen.getByText('Only me'));
    expect(onChangeScope).toHaveBeenCalledWith('personal');
  });

  test('"Forget this" calls onForget', async () => {
    const onForget = jest.fn();
    await renderWithTheme(<SaveChip chip={SAMPLE_SAVE_CHIP} onChangeScope={jest.fn()} onForget={onForget} />);
    await fireEvent.press(screen.getByLabelText('Saved, Family. Tap to change.'));
    await fireEvent.press(screen.getByText('Forget this'));
    expect(onForget).toHaveBeenCalled();
  });

  test('read-only (kids): shows the chip with no tap target and never opens the sheet', async () => {
    const onChangeScope = jest.fn();
    await renderWithTheme(<SaveChip chip={SAMPLE_SAVE_CHIP} onChangeScope={onChangeScope} onForget={jest.fn()} readOnly />);
    expect(screen.getByText('Saved · Family')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Saved, Family'));
    expect(screen.queryByText('Change scope')).toBeNull();
    expect(onChangeScope).not.toHaveBeenCalled();
  });
});
