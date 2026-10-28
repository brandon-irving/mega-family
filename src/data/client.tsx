// Convex client provider, wired to Better Auth (PLAN.md → Sign-in). `src/services/auth.ts` is the only
// other file that knows Better Auth exists — this just plugs its `authClient` into the Convex provider.
import { ConvexBetterAuthProvider, type AuthClient } from '@convex-dev/better-auth/react';
import { ConvexReactClient } from 'convex/react';
import type { ReactNode } from 'react';
import { authClient } from '@/services/auth';
import { ConvexAuthWatcher } from '@/services/convexAuthReady';
import { appConvexLogger } from './convexLogger';

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!url && __DEV__) {
  console.warn('EXPO_PUBLIC_CONVEX_URL is not set — queries will fail until the backend lands and .env is configured.');
}

/** A single client for the app; placeholder URL keeps the app renderable before the backend lands.
 * `expectAuth: true` pauses queries until Better Auth has resolved a session, so the root layout's auth
 * gate (never a flash of signed-out content) can rely on `me.get` only running once that's settled. */
export const convex = new ConvexReactClient(url ?? 'https://placeholder.convex.cloud', { expectAuth: true, unsavedChangesWarning: false, logger: appConvexLogger });

export function DataProvider({ children }: { children: ReactNode }) {
  return (
    // The cast is for @convex-dev/better-auth@0.12.6's own `AuthClient` type only: it's built from an
    // explicit (not value-inferred) `createAuthClient<...>` type argument, which resolves `useSession()`'s
    // session field to `never` regardless of which concrete, correctly-typed client is passed in — a type-
    // level bug in that package's declarations, not anything about `authClient` itself (which is properly
    // typed throughout src/services/auth.ts, including a correct `useSession()` there).
    <ConvexBetterAuthProvider client={convex} authClient={authClient as unknown as AuthClient}>
      <ConvexAuthWatcher />
      {children}
    </ConvexBetterAuthProvider>
  );
}
