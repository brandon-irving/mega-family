import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TEAL_INFO } from '@/test/fixtures';
import { ChatHeader } from './ChatHeader';

jest.mock('@/features/shell/AppSettingsButton', () => ({ AppSettingsButton: () => null }));

test('keeps profile and Today actions without a fabricated readiness status', async () => {
  const onOpenProfile = jest.fn();
  const onOpenToday = jest.fn();
  await renderWithTheme(<ChatHeader mega={TEAL_INFO} todayCount={3} onOpenProfile={onOpenProfile} onOpenToday={onOpenToday} />);
  expect(screen.queryByText('Ready to help')).toBeNull();
  await fireEvent.press(screen.getByLabelText("Open Teal's profile"));
  await fireEvent.press(screen.getByLabelText('Today, 3 waiting on you'));
  expect(onOpenProfile).toHaveBeenCalledTimes(1);
  expect(onOpenToday).toHaveBeenCalledTimes(1);
});

test('identifies the person during a demo switch without replacing the MEGA name', async () => {
  await renderWithTheme(<ChatHeader mega={TEAL_INFO} demoPersonName="Lovie" todayCount={0} onOpenProfile={jest.fn()} onOpenToday={jest.fn()} />);
  expect(screen.getByText('Lovie')).toBeTruthy();
  expect(screen.getByText('Teal')).toBeTruthy();
});
