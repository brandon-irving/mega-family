import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderWithTheme } from '@/test/renderWithTheme';
import LookRoute from '@/app/mega-profile/look';
import { COLORS } from '@shared/config/looks';

const mockUpdate = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/data/useViewer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { COLORS } = require('@shared/config/looks');
  return { useViewer: () => ({ member: { role: 'adult' }, mega: { look: { hex: COLORS.teal, sticker: 'none' }, personality: 'calm' } }) };
});
jest.mock('@/data/useMega', () => ({ useUpdateMega: () => mockUpdate }));
jest.mock('@/data/useStore', () => ({ useStoreCatalog: () => ({ status: 'skip' }) }));

test('a late customization save does not navigate back after the editor closes', async () => {
  let finish!: () => void;
  mockUpdate.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await renderWithTheme(<LookRoute />);
  await fireEvent.press(screen.getByText('Save'));
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ look: expect.objectContaining({ hex: COLORS.teal }) }));
  await view.unmount();
  await act(async () => { finish(); });
  expect(router.back).not.toHaveBeenCalled();
});
