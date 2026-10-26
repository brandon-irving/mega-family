// No-flicker rule: useStableQuery keeps the last defined value instead of flashing back to undefined.
import { renderHook } from '@testing-library/react-native';
import { useStableQuery } from './useStableQuery';

type Props<T> = { value: T };

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
