// Demo sign-in (dev builds): an anonymous session, then `demo.signInAs` links it to a sample member. The
// mutation must not run until the Convex client is sending the new session (convexAuthReady.ts); a failed
// call is logged by the Convex client itself, which raised the dev error overlay on every demo sign-in
// (G4 UX review, Oct 28). The retry stays only as a backstop for a token that's still being swapped.
import { ConvexError } from 'convex/values';
import { AUTH } from '@shared/config/auth';

export type DemoSignInSteps = {
  signInAnonymously: () => Promise<void>;
  waitForAuth: (timeoutMs: number) => Promise<boolean>;
  linkMember: () => Promise<unknown>;
};

export async function demoSignIn({ signInAnonymously, waitForAuth, linkMember }: DemoSignInSteps): Promise<void> {
  await signInAnonymously();
  await waitForAuth(AUTH.freshSessionWaitMs);
  await withFreshSession(linkMember);
}

/** Retries a call that came back UNAUTHENTICATED a few times (AUTH.freshSessionRetry). */
export async function withFreshSession<T>(call: () => Promise<T>): Promise<T> {
  const { attempts, delayMs } = AUTH.freshSessionRetry;
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (e) {
      const code = e instanceof ConvexError ? (e.data as { code?: string } | undefined)?.code : undefined;
      if (code !== 'UNAUTHENTICATED' || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
