// No-flicker rule (owner directive): a query result going briefly back to `undefined` — a reconnect, a
// re-subscribe after an arg change, a screen remounting — should never flash a loading/empty state over
// content that was already on screen. Wraps any `useQuery(...)` result and keeps the last defined value
// until a new one arrives. The *first* load still returns `undefined` (there's nothing to hold onto yet),
// so screens keep their existing `viewer === undefined` loading check — this only smooths out refetches.
//
// Uses `useState`, not a mutated ref: React's own "storing information from previous renders" pattern
// (https://react.dev/reference/react/useState#storing-information-from-previous-renders) — calling
// `setState` conditionally during render is a documented, compiler-safe escape hatch; mutating a ref
// during render is not (the React Compiler enabled in this app, app.config.ts, rejects it outright).
import { useState } from 'react';

export function useStableQuery<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value === undefined ? last : value;
}

/** The paginated-query equivalent of useStableQuery, for the same no-flicker rule: `usePaginatedQuery`
 * resets to `status: "LoadingFirstPage"` with `results: []` whenever its args change (convex/react docs:
 * "If the query reference or arguments change, the pagination state will be reset to the first page") —
 * e.g. switching which family member's kid-thread or MEGA-memory search is loaded. Without this, that
 * reset briefly flashes the empty/loading state over a list that already had content.
 *
 * Generic over the whole result object (not imported from convex/react — `UsePaginatedQueryResult` isn't
 * part of its public export surface) so callers keep the exact discriminated-union shape `usePaginatedQuery`
 * gives them (`status`/`isLoading` still narrow together).
 *
 * CRASH FIX: must not compare `paginated` *as a whole* by reference. convex/react's `usePaginatedQuery`
 * internally memoizes `results` and the `status`/`isLoading`/`loadMore` trio separately, then returns them
 * spread into a *brand-new* wrapper object (`{ results, ...statusObject }`) on every single render/call,
 * even when neither memo recomputed — so `paginated !== last` is true on every render regardless of
 * whether anything real changed. Setting state on every render from that check is a render-phase setState
 * loop: `setLast` runs, React immediately re-renders this hook within the same update, which calls
 * `usePaginatedQuery` again, which hands back *another* fresh wrapper (still "different" by reference,
 * same reasoning), so the condition never stops being true — "Too many re-renders" (caught live via a
 * real sign-in redirect to /chat, which used this through useChatThread). Comparing `results` (itself
 * independently memoized) and `status` (a plain string, and — since one useMemo governs `status`,
 * `isLoading` and `loadMore` together — the one primitive that stands in for all three) instead converges
 * immediately once nothing new has actually arrived. Holds the *entire* last non-"LoadingFirstPage" result
 * and keeps returning it while a genuine resume is in flight — not the very first load, since `last` itself
 * starts at "LoadingFirstPage" too, so a first load still shows loading — the same "storing information
 * from previous renders" render-time setState pattern useStableQuery uses (React-Compiler-safe; see
 * useStableQuery's own comment). */
export function useStablePaginatedQuery<T extends { status: string; results: unknown }>(paginated: T, scopeKey?: string): T {
  const [snapshot, setSnapshot] = useState({ value: paginated, scopeKey });
  const scopeChanged = snapshot.scopeKey !== scopeKey;
  const last = scopeChanged ? paginated : snapshot.value;
  const resuming = paginated.status === 'LoadingFirstPage' && last.status !== 'LoadingFirstPage';
  const changed = paginated.results !== last.results || paginated.status !== last.status;
  // A profile change is not a reconnect: never retain the previous person’s messages or cursor.
  if (scopeChanged || (!resuming && changed)) setSnapshot({ value: paginated, scopeKey });
  return resuming ? last : paginated;
}
