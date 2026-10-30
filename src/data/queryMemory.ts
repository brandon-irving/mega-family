// The last value of each item query a chat card read (useQueryState), kept across remounts so a card the
// viewer already saw renders at once when Chat remounts instead of flashing its loading state (G4 UX review,
// Oct 28). Keyed by function name + args; cleared whenever the signed-in session changes
// (src/services/convexAuthReady.ts), so one person's cards can never show for another. Bound the cache
// even for sessions that never sign out: scrolling through old chat cards must not retain every item
// ever read. 128 recent results cover several chat pages; evicted cards reload normally on remount.
const MAX_REMEMBERED_QUERIES = 128;
const memory = new Map<string, unknown>();

export function rememberQuery(key: string, value: unknown) {
  memory.delete(key);
  memory.set(key, value);
  if (memory.size > MAX_REMEMBERED_QUERIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

export function recallQuery<T>(key: string): T | undefined {
  const value = memory.get(key);
  if (memory.has(key)) {
    memory.delete(key);
    memory.set(key, value);
  }
  return value as T | undefined;
}

export function clearQueryMemory() {
  memory.clear();
}
