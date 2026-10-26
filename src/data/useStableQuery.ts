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
