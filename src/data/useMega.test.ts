// `useSharing` must call api.sharing.get (CONTRACT §4) — not invent data — so the MEGA profile's "What
// it shares" section reflects the real row (or hides for a kid, who has none).
import { renderHook } from '@testing-library/react-native';
import { useQuery } from 'convex/react';
import { api } from './api';
import { useSharing } from './useMega';

jest.mock('convex/react', () => ({ useQuery: jest.fn(), useMutation: jest.fn(), usePaginatedQuery: jest.fn() }));

describe('useSharing', () => {
  test('calls api.sharing.get with no args and returns its result as-is', async () => {
    (useQuery as jest.Mock).mockReturnValue({ schedule: 'partner', lists: 'me', hqActivity: 'family' });
    const { result } = await renderHook(() => useSharing());
    expect(useQuery).toHaveBeenCalledWith(api.sharing.get, {});
    expect(result.current).toEqual({ schedule: 'partner', lists: 'me', hqActivity: 'family' });
  });

  test('passes through null (a kid viewer, who has no sharing row) unchanged', async () => {
    (useQuery as jest.Mock).mockReturnValue(null);
    const { result } = await renderHook(() => useSharing());
    expect(result.current).toBeNull();
  });
});
