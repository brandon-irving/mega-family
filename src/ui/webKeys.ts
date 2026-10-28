// Where web keyboard events (Escape) are listened for: the page's document. Its own module so tests can
// swap it for a fake instead of creating a global `document` (which changes how React itself behaves).
export type KeyTarget = {
  addEventListener: (type: 'keydown', fn: (e: { key: string }) => void) => void;
  removeEventListener: (type: 'keydown', fn: (e: { key: string }) => void) => void;
};

export function webKeyTarget(): KeyTarget | undefined {
  return (globalThis as { document?: KeyTarget }).document;
}
