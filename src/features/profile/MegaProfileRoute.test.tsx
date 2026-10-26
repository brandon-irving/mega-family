// PLAN §3 "What it shares" (CONTRACT §4 `sharing.get`): mega-profile/index.tsx used to pass a hardcoded
// literal `{ schedule: 'family', lists: 'family', hqActivity: 'family' }`, so the section could only ever
// hide based on *role*, never on the actual data (e.g. a kid, who has no `sharing` row — `sharing.get`
// reports null for them). This renders the real ProfileContent and proves the section's visibility now
// tracks useSharing's result.
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import MegaProfileRoute from '@/app/mega-profile/index';

// jest.mock factories can't close over an out-of-scope variable unless its name starts with "mock".
const mockMega = { _id: 'megas_teal', name: 'Teal', look: { hex: '#2FB8B0', sticker: 'star' }, personality: 'calm' };

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ member: { role: 'admin' }, mega: mockMega }) }));

const mockSharing = jest.fn();
jest.mock('@/data/useMega', () => ({
  useMegaStatus: () => null,
  useUpdateMega: () => jest.fn(),
  useSetSharing: () => jest.fn(),
  useSharing: () => mockSharing(),
}));

describe('MegaProfileRoute "What it shares" visibility', () => {
  test('hides the card when useSharing reports null (a kid, or no row yet) — even though the viewer is an admin', async () => {
    mockSharing.mockReturnValue(null);
    await renderWithTheme(<MegaProfileRoute />);
    expect(screen.queryByText('What it shares')).toBeNull();
  });

  test('shows the card once useSharing has real data', async () => {
    mockSharing.mockReturnValue({ schedule: 'family', lists: 'family', hqActivity: 'family' });
    await renderWithTheme(<MegaProfileRoute />);
    expect(screen.getByText('What it shares')).toBeTruthy();
  });
});
