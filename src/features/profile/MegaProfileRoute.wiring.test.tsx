// Companion to MegaProfileRoute.test.tsx: proves the `sharing` prop ProfileContent receives is exactly
// useSharing's own return value — not the hardcoded `{ schedule: 'family', lists: 'family',
// hqActivity: 'family' }` literal mega-profile/index.tsx used to pass regardless of any real data.
// ProfileContent is stubbed to a prop-dump so this isolates the wiring from ProfileContent's own
// rendering (covered separately by MegaProfileRoute.test.tsx).
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
// A jest.mock factory can't close over an import (it runs before imports are hoisted in), so
// react-native's Text is required here instead.
jest.mock('@/features/profile/ProfileContent', () => {
  // A jest.mock factory runs before the file's own ES imports are hoisted in, so it can't close over
  // one; it must require() instead.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return {
    ProfileContent: (props: { sharing?: unknown }) => <Text testID="sharing-dump">{JSON.stringify(props.sharing ?? null)}</Text>,
  };
});

describe('MegaProfileRoute "What it shares" wiring', () => {
  test("passes useSharing's own result through, not the old hardcoded family/family/family literal", async () => {
    const liveSharing = { schedule: 'partner', lists: 'me', hqActivity: 'family' };
    mockSharing.mockReturnValue(liveSharing);
    await renderWithTheme(<MegaProfileRoute />);
    expect(screen.getByTestId('sharing-dump').props.children).toBe(JSON.stringify(liveSharing));
  });
});
