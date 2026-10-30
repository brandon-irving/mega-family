import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { NotifySheet } from './SettingsSheets';
import { G5_UI_COPY as U } from '@shared/config/copy';

jest.mock('@/ui/ModalSheet', () => ({ ModalSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? children : null }));
const notify = { loudKinds: [] as never[], quietHours: { start: '21:00', end: '07:00' }, dailyCap: 3 };

test('quiet hours opens its own controls and disables edits while saving', async () => {
  const onChange = jest.fn();
  await renderWithTheme(<NotifySheet open section="quiet" notify={notify} busy onClose={jest.fn()} onChange={onChange} />);
  expect(screen.getByText(U.quietFrom)).toBeTruthy();
  expect(screen.queryByText(U.dailyLimit)).toBeNull();
  expect(screen.queryByText(U.kindLabels.reminder)).toBeNull();
  await fireEvent.press(screen.getByLabelText(U.earlier.replace('{label}', U.quietFrom)));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText('Saving…')).toBeTruthy();
});
