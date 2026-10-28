// The last value of each item query a chat card read (useQueryState), kept across remounts so a card the
// viewer already saw renders at once when Chat remounts instead of flashing its loading state (G4 UX review,
// Oct 28). Keyed by function name + args; cleared whenever the signed-in session changes
// (src/services/convexAuthReady.ts), so one person's cards can never show for another.
const memory = new Map<string, unknown>();

export function rememberQuery(key: string, value: unknown) {
  memory.set(key, value);
}

export function recallQuery<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

export function clearQueryMemory() {
  memory.clear();
}
