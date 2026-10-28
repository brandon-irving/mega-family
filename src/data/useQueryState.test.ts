// useQueryState: a server error (a GD stub's NOT_FOUND, a FORBIDDEN, a deleted item) comes back as data —
// the chat thread must never crash because one card's item can't be read.
import { renderHook } from '@testing-library/react-native';
import { makeFunctionReference } from 'convex/server';

const mockUseQueries = jest.fn();
jest.mock('convex/react', () => ({ useQueries: (q: unknown) => mockUseQueries(q), useQuery: jest.fn() }));

// eslint-disable-next-line import/first -- the mock above must be registered before the module loads
import { useQueryState } from './useQuery';
// eslint-disable-next-line import/first -- same
import { clearQueryMemory } from './queryMemory';

const ref = makeFunctionReference<'query'>('practice:get');

describe('useQueryState', () => {
  beforeEach(() => {
    mockUseQueries.mockReset();
    clearQueryMemory();
  });

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

  // G4 UX review HIGH (Oct 28): chat cards flashed their loading line every time Chat remounted, though the
  // data had loaded moments before. A remounted card must render the last value at once.
  test('a remount shows the last value at once while the query re-subscribes', async () => {
    mockUseQueries.mockReturnValue({ q: { n: 1 } });
    const first = await renderHook(() => useQueryState(ref, { setId: 'x' }));
    expect(first.result.current).toEqual({ status: 'ok', data: { n: 1 } });
    await first.unmount();
    mockUseQueries.mockReturnValue({ q: undefined });
    const again = await renderHook(() => useQueryState(ref, { setId: 'x' }));
    expect(again.result.current).toEqual({ status: 'ok', data: { n: 1 } });
  });

  test('the memory is per item and is cleared on sign-out', async () => {
    mockUseQueries.mockReturnValue({ q: { n: 1 } });
    await (await renderHook(() => useQueryState(ref, { setId: 'x' }))).unmount();
    mockUseQueries.mockReturnValue({ q: undefined });
    expect((await renderHook(() => useQueryState(ref, { setId: 'y' }))).result.current).toEqual({ status: 'loading' });
    clearQueryMemory();
    expect((await renderHook(() => useQueryState(ref, { setId: 'x' }))).result.current).toEqual({ status: 'loading' });
  });
});
