// useQueryState: a server error (a GD stub's NOT_FOUND, a FORBIDDEN, a deleted item) comes back as data —
// the chat thread must never crash because one card's item can't be read.
import { renderHook } from '@testing-library/react-native';
import { makeFunctionReference } from 'convex/server';

const mockUseQueries = jest.fn();
jest.mock('convex/react', () => ({ useQueries: (q: unknown) => mockUseQueries(q), useQuery: jest.fn() }));

// eslint-disable-next-line import/first -- the mock above must be registered before the module loads
import { useQueryState } from './useQuery';

const ref = makeFunctionReference<'query'>('practice:get');

describe('useQueryState', () => {
  beforeEach(() => mockUseQueries.mockReset());

  test('loading while the result is undefined', async () => {
    mockUseQueries.mockReturnValue({ q: undefined });
    const { result } = await renderHook(() => useQueryState(ref, { setId: 'x' }));
    expect(result.current).toEqual({ status: 'loading' });
  });

  test('a server error is returned, not thrown', async () => {
    const error = new Error("practice.get isn't built yet (GD stub)");
    mockUseQueries.mockReturnValue({ q: error });
    const { result } = await renderHook(() => useQueryState(ref, { setId: 'x' }));
    expect(result.current).toEqual({ status: 'error', error });
  });

  test('a value is ok; "skip" subscribes to nothing', async () => {
    mockUseQueries.mockReturnValue({ q: { n: 1 } });
    const { result } = await renderHook(() => useQueryState(ref, { setId: 'x' }));
    expect(result.current).toEqual({ status: 'ok', data: { n: 1 } });
    mockUseQueries.mockReturnValue({});
    await renderHook(() => useQueryState(ref, 'skip'));
    expect(mockUseQueries).toHaveBeenLastCalledWith({});
  });
});
