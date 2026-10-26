// The data layer's single `useQuery` wrapper (G2 fix item 2: "Tabs remount/reflash"). Every screen-level
// query in src/data/* goes through this instead of calling convex/react's `useQuery` directly, so the
// no-flicker rule (PLAN.md "UX quality bar": "keep the last data while queries refetch") applies
// everywhere at once — one call site, not one per hook. src/test/noRawUseQuery.test.ts fails CI if any
// file outside this one (and useStableQuery.ts itself) imports `useQuery` from 'convex/react'.
import { useQuery as useConvexQuery, type OptionalRestArgsOrSkip } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';
import { useStableQuery } from './useStableQuery';

export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  return useStableQuery(useConvexQuery(query, ...args));
}
