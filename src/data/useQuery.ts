// The data layer's single `useQuery` wrapper (G2 fix item 2: "Tabs remount/reflash"). Every screen-level
// query in src/data/* goes through this instead of calling convex/react's `useQuery` directly, so the
// no-flicker rule (PLAN.md "UX quality bar": "keep the last data while queries refetch") applies
// everywhere at once — one call site, not one per hook. src/test/noRawUseQuery.test.ts fails CI if any
// file outside this one (and useStableQuery.ts itself) imports `useQuery` from 'convex/react'.
import { useEffect, useMemo } from 'react';
import { useQueries, useQuery as useConvexQuery, type OptionalRestArgsOrSkip } from 'convex/react';
import { type FunctionArgs, type FunctionReference, type FunctionReturnType, getFunctionName } from 'convex/server';
import { recallQuery, rememberQuery } from './queryMemory';
import { useStableQuery } from './useStableQuery';

export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  return useStableQuery(useConvexQuery(query, ...args));
}

/** A query's state as data instead of a throw: loading, its value, or the server's error. */
export type QueryState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: Error };

/**
 * GD: like `useQuery`, but a server error comes back as `{ status: 'error' }` instead of being thrown into
 * render. For the chat cards and screens that read one item by id (`practice.get`, `proposals.get`, …): a
 * card whose item is gone, forbidden or (while GD is being built) still a stub (`convex/model/gdStub.ts`
 * throws NOT_FOUND) must render a calm fallback line, not crash the whole thread. Same no-flicker hold as
 * `useQuery` (the last good value stays while a refetch is in flight).
 *
 * Built on convex/react's `useQueries`, whose docs say it returns an `Error` for a failed query rather than
 * throwing. It re-subscribes whenever its argument object changes identity, so the object is memoized on
 * the function's name plus the args' JSON (the same content key convex/react's own `useQuery` uses).
 */
export function useQueryState<Query extends FunctionReference<'query'>>(query: Query, args: FunctionArgs<Query> | 'skip'): QueryState<FunctionReturnType<Query>> {
  const name = getFunctionName(query);
  const key = args === 'skip' ? 'skip' : JSON.stringify(args);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content (name + JSON), not identity
  const request = useMemo(() => (args === 'skip' ? {} : { q: { query, args } }), [name, key]);
  const result = useQueries(request as Parameters<typeof useQueries>[0]).q as FunctionReturnType<Query> | Error | undefined;
  const value = result instanceof Error ? undefined : result;
  // G4 UX review (Oct 28): a card remounting with Chat shows the last value it had (queryMemory.ts) while its
  // query re-subscribes, instead of flashing its loading state.
  const memoryKey = args === 'skip' ? null : `${name}:${key}`;
  useEffect(() => {
    if (memoryKey && value !== undefined) rememberQuery(memoryKey, value);
  }, [memoryKey, value]);
  const held = useStableQuery(value);
  // null is a real empty result (for example a completed draft), never a loading state.
  const stable = held === undefined ? (memoryKey ? recallQuery<FunctionReturnType<Query>>(memoryKey) : undefined) : held;
  if (result instanceof Error) return { status: 'error', error: result };
  if (stable === undefined) return { status: 'loading' };
  return { status: 'ok', data: stable };
}
