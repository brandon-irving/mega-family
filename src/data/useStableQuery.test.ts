// No-flicker rule: useStableQuery keeps the last defined value instead of flashing back to undefined.
import { renderHook } from '@testing-library/react-native';
import { useStableQuery, useStablePaginatedQuery } from './useStableQuery';

type Props<T> = { value: T };

type Paginated<Item> = { results: Item[]; status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'; loadMore: (n: number) => void };

function paginated<Item>(results: Item[], status: Paginated<Item>['status']): Paginated<Item> {
  return { results, status, loadMore: () => {} };
}

describe('useStableQuery', () => {
  test('returns undefined until the first value arrives', async () => {
    const { result } = await renderHook<number | undefined, Props<number | undefined>>(({ value }) => useStableQuery(value), {
      initialProps: { value: undefined },
    });
    expect(result.current).toBeUndefined();
  });

  test('keeps the last defined value when the query briefly goes back to undefined (a refetch)', async () => {
    const { result, rerender } = await renderHook<number | undefined, Props<number | undefined>>(({ value }) => useStableQuery(value), {
      initialProps: { value: 1 },
    });
    expect(result.current).toBe(1);

    await rerender({ value: undefined });
    expect(result.current).toBe(1); // still 1 — no flash back to "loading"

    await rerender({ value: 2 });
    expect(result.current).toBe(2);
  });

  test('a falsy-but-defined value (null) is not treated as "no value yet"', async () => {
    const { result, rerender } = await renderHook<string | null | undefined, Props<string | null | undefined>>(({ value }) => useStableQuery(value), {
      initialProps: { value: 'first' },
    });
    await rerender({ value: null });
    expect(result.current).toBeNull();
    await rerender({ value: undefined });
    expect(result.current).toBeNull(); // holds the last defined value, which was null
  });
});

describe('useStablePaginatedQuery', () => {
  test('a genuine first load still reports LoadingFirstPage (no prior data to hold onto)', async () => {
    const first = paginated<number>([], 'LoadingFirstPage');
    const { result } = await renderHook<Paginated<number>, Props<Paginated<number>>>(({ value }) => useStablePaginatedQuery(value), {
      initialProps: { value: first },
    });
    expect(result.current.status).toBe('LoadingFirstPage');
    expect(result.current.results).toEqual([]);
  });

  test('resuming to LoadingFirstPage after args change keeps showing the last page instead of flashing empty', async () => {
    const loaded = paginated([1, 2, 3], 'CanLoadMore');
    const { result, rerender } = await renderHook<Paginated<number>, Props<Paginated<number>>>(({ value }) => useStablePaginatedQuery(value), {
      initialProps: { value: loaded },
    });
    expect(result.current).toBe(loaded);

    // The args changed (e.g. a different family member's kid-thread) — convex/react resets to a fresh
    // first-page load. Without the fix this would flash `results: []` over the previously loaded page.
    await rerender({ value: paginated<number>([], 'LoadingFirstPage') });
    expect(result.current).toBe(loaded); // still the old page, not the empty reset

    const nextLoaded = paginated([4, 5], 'CanLoadMore');
    await rerender({ value: nextLoaded });
    expect(result.current).toBe(nextLoaded); // the new args' real data replaces it once it arrives
  });

  test('changing profile drops retained messages and the old loadMore cursor immediately', async () => {
    const old = paginated(['private old message'], 'CanLoadMore');
    const { result, rerender } = await renderHook(({ value, profile }: { value: Paginated<string>; profile: string }) => useStablePaginatedQuery(value, profile), {
      initialProps: { value: old, profile: 'original' },
    });
    const fresh = paginated<string>([], 'LoadingFirstPage');
    await rerender({ value: fresh, profile: 'demo' });
    expect(result.current).toBe(fresh);
    expect(result.current.results).toEqual([]);
    expect(result.current.loadMore).not.toBe(old.loadMore);
  });

  test('loading more (not a reset) is reported immediately, not held back', async () => {
    const loaded = paginated([1, 2], 'CanLoadMore');
    const { result, rerender } = await renderHook<Paginated<number>, Props<Paginated<number>>>(({ value }) => useStablePaginatedQuery(value), {
      initialProps: { value: loaded },
    });
    const loadingMore = paginated([1, 2], 'LoadingMore');
    await rerender({ value: loadingMore });
    expect(result.current).toBe(loadingMore); // not a reset to LoadingFirstPage — passes through untouched
  });

  // CRASH REGRESSION (caught live via a real sign-in redirect to /chat, which uses this through
  // useChatThread): convex/react's real `usePaginatedQuery` returns a *brand-new* `{ results, ...status }`
  // wrapper object on every single call, even when nothing changed — its `results` array and `status`/
  // `loadMore` trio are each independently memoized *inside* convex/react, but the outer object spreading
  // them together is not. An earlier version of this hook compared `paginated !== last` (the *whole*
  // wrapper, by reference) — always true, since a fresh wrapper never equals the last one stored — so it
  // called `setLast` unconditionally on every render. That's a setState call *during render*: React
  // retries the same render immediately, which calls the paginated-query producer again, which hands back
  // *another* fresh wrapper (same reasoning), so the retry never converges — "Too many re-renders".
  test("CRASH REGRESSION: a fresh wrapper object every call (convex/react's own usePaginatedQuery shape) does not loop forever", async () => {
    const stableResults = [1, 2, 3]; // one stable array reference, as convex/react's internal useMemo gives
    const stableLoadMore = () => {};
    // Mimics convex/react's usePaginatedQuery: a fresh `{ results, status, loadMore }` object literal
    // every call, built from references that themselves don't change across calls (`stableResults`,
    // `stableLoadMore`) — exactly convex/react's own shape, not the simplified "same object" fixture the
    // other tests in this file use.
    const fakeConvexPaginatedQuery = () => ({ results: stableResults, status: 'CanLoadMore' as const, loadMore: stableLoadMore });

    const { result, rerender } = await renderHook(() => useStablePaginatedQuery(fakeConvexPaginatedQuery()));
    const firstWrapper = result.current;

    // A second render with nothing new (the exact trigger: some unrelated state elsewhere in the real
    // component re-rendering ChatRoute). Must not throw "Too many re-renders", and must converge: the
    // *contents* are unchanged, so the hook should settle rather than oscillate.
    await expect(rerender(undefined)).resolves.toBeUndefined();
    expect(result.current.results).toBe(stableResults);
    expect(result.current.status).toBe('CanLoadMore');
    // Not asserting `result.current === firstWrapper` — the hook may legitimately pass the newest wrapper
    // straight through on an unchanged render; what matters is that it didn't throw and the data is right.
    void firstWrapper;
  });
});
