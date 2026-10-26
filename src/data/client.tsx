// Convex client provider. A simple provider for G1 — sign-in UI and the Better Auth provider land
// when the backend does; src/services/auth.ts is the seam that will slot auth in without touching this.
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import type { ReactNode } from 'react';

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!url && __DEV__) {
  // eslint-disable-next-line no-console
  console.warn('EXPO_PUBLIC_CONVEX_URL is not set — queries will fail until the backend lands and .env is configured.');
}

/** A single client for the app; placeholder URL keeps the app renderable before the backend lands. */
export const convex = new ConvexReactClient(url ?? 'https://placeholder.convex.cloud');

export function DataProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
