// G4 UX review BLOCKER (Oct 28): demo sign-in fired `demo.signInAs` before the Convex client had the new
// anonymous session's token, so it failed UNAUTHENTICATED and the Convex client's own error log raised the
// dev overlay over chat. The link call must wait for the client to be authenticated.
import { demoSignIn } from './demoSignIn';
import { setConvexAuthed, waitForConvexAuth } from './convexAuthReady';
import { AUTH } from '@shared/config/auth';

beforeEach(() => {
  jest.useFakeTimers();
  setConvexAuthed(false);
});
afterEach(() => {
  jest.useRealTimers();
});

test('links the member only after the Convex client reports the new session', async () => {
  const order: string[] = [];
  const linkMember = jest.fn(async () => {
    order.push('link');
  });
  const run = demoSignIn({
    signInAnonymously: async () => {
      order.push('anon');
    },
    waitForAuth: waitForConvexAuth,
    linkMember,
  });
  // The anonymous sign-in has resolved, but the Convex client isn't authenticated yet.
  await Promise.resolve();
  await Promise.resolve();
  expect(order).toEqual(['anon']);
  expect(linkMember).not.toHaveBeenCalled();

  // The client picks up the token a moment later (late auth).
  await jest.advanceTimersByTimeAsync(400);
  expect(linkMember).not.toHaveBeenCalled();
  setConvexAuthed(true);
  await run;
  expect(order).toEqual(['anon', 'link']);
});

test('gives up waiting after AUTH.freshSessionWaitMs and still tries (the server answers calmly)', async () => {
  const linkMember = jest.fn(async () => {});
  const run = demoSignIn({ signInAnonymously: async () => {}, waitForAuth: waitForConvexAuth, linkMember });
  await jest.advanceTimersByTimeAsync(AUTH.freshSessionWaitMs + 10);
  await run;
  expect(linkMember).toHaveBeenCalledTimes(1);
});

test('waitForConvexAuth resolves at once when already authenticated', async () => {
  setConvexAuthed(true);
  await expect(waitForConvexAuth(1000)).resolves.toBe(true);
});
