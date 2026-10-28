// A sign-in that will end in a family member, but goes through "signed in, no member yet" on the way (demo
// sign-in: an anonymous session first, then `demo.signInAs` links the member). While it's held, the auth
// gate keeps the loader up instead of flashing "Let's set up your family" (found live, Oct 28). The gate
// lets go once the member arrives; a failed sign-in lets go itself; AUTH.signInHoldMaxMs is the backstop.
import { useSyncExternalStore } from 'react';
import { AUTH } from '@shared/config/auth';

let held = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (held === next) return;
  held = next;
  listeners.forEach((l) => l());
}

export function holdSignIn() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(releaseSignIn, AUTH.signInHoldMaxMs);
  set(true);
}

export function releaseSignIn() {
  if (timer) clearTimeout(timer);
  timer = null;
  set(false);
}

/** Runs a sign-in under the hold; if it fails the hold is let go so the screen behind can show the error. */
export async function withSignInHold<T>(work: () => Promise<T>): Promise<T> {
  holdSignIn();
  try {
    return await work();
  } catch (e) {
    releaseSignIn();
    throw e;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSignInHeld(): boolean {
  return useSyncExternalStore(subscribe, () => held, () => false);
}
