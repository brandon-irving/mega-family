// Whether the Convex client is sending an authenticated session right now. Signing in with Better Auth
// resolves before the Convex client has fetched the new session's token, so a mutation fired straight after
// it ran unauthenticated and failed (G4 UX review, Oct 28: `demo.signInAs` UNAUTHENTICATED on every demo
// sign-in). `ConvexAuthWatcher` (mounted inside the Convex provider, src/data/client.tsx) mirrors
// `useConvexAuth()` here, and `waitForConvexAuth` lets a sign-in wait for it before its first call.
import { useEffect } from 'react';
import { useConvexAuth } from 'convex/react';
import { clearQueryMemory } from '@/data/queryMemory';

let authed = false;
const waiters = new Set<() => void>();

export function setConvexAuthed(next: boolean) {
  // A different session (signed out, or someone else signed in) must never see the last one's cards.
  if (next !== authed) clearQueryMemory();
  authed = next;
  if (next) {
    waiters.forEach((w) => w());
    waiters.clear();
  }
}

/** Resolves `true` once the Convex client is authenticated, or `false` after `timeoutMs`. */
export function waitForConvexAuth(timeoutMs: number): Promise<boolean> {
  if (authed) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      waiters.delete(done);
      resolve(false);
    }, timeoutMs);
    waiters.add(done);
  });
}

export function ConvexAuthWatcher() {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    setConvexAuthed(isAuthenticated);
  }, [isAuthenticated]);
  return null;
}
