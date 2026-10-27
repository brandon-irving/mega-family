// Auth adapter (PLAN.md → Sign-in): the only place in the app that imports Better Auth, Apple's and
// Google's native sign-in SDKs. Every other module calls the functions this file exports — `src/data/client.tsx`
// wires `authClient` into `ConvexBetterAuthProvider`, and `src/app/welcome.tsx` / Settings call the sign-in
// and sign-out functions. Swapping an identity provider later means editing this file alone.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { anonymousClient } from 'better-auth/client/plugins';
import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
import { IDENTITY } from '@shared/config/identity';
import { CONVEX_SITE_URL } from './convexConfig';

const baseURL = CONVEX_SITE_URL;

const scheme = (Constants.expoConfig?.scheme as string | undefined) ?? IDENTITY.scheme;

// expoClient and crossDomainClient can't both be present (current Convex Better Auth Expo guide): native
// sessions live in expo-secure-store, web uses the cross-domain cookie flow. The native branch's cast is
// for `expoClient`'s return type only: `@better-auth/expo@1.6.33`'s `getActions` signature doesn't
// structurally match `better-auth@1.6.33`'s own `BetterAuthClientPlugin` under strict parameter variance
// (a real type-level mismatch between those two packages' published declarations, not anything caused
// here), and widening it to the general `BetterAuthClientPlugin` interface instead of `crossDomainClient`'s
// concrete type collapses `useSession()`'s inferred session type to `never`. Runtime behavior (the
// plugin's cookie storage + focus/online managers wired for Expo) is unaffected either way — only the
// taken branch runs.
export const authClient =
  Platform.OS === 'web'
    ? createAuthClient({ baseURL, plugins: [convexClient(), anonymousClient(), crossDomainClient()] })
    : createAuthClient({
        baseURL,
        plugins: [convexClient(), anonymousClient(), expoClient({ scheme, storagePrefix: scheme, storage: SecureStore }) as unknown as ReturnType<typeof crossDomainClient>],
      });

export type AuthState = { status: 'signedOut' } | { status: 'signedIn' } | { status: 'loading' };

/** The root layout's auth gate reads this: loading while the session is being restored, signedOut before
 * any sign-in, signedIn once Better Auth has a session (member-or-not is a separate question — `me.get`). */
export function useAuthState(): AuthState {
  const { data, isPending } = authClient.useSession();
  if (isPending) return { status: 'loading' };
  return data?.session ? { status: 'signedIn' } : { status: 'signedOut' };
}

function messageOf(error: { message?: string } | null | undefined, fallback: string): string {
  return error?.message ?? fallback;
}

/** iOS only (PLAN.md: "Apple and Google, natively, no browser") — `expo-apple-authentication` gets the
 * identity token, then Better Auth verifies it on the server with no redirect. */
export async function signInWithApple(): Promise<void> {
  if (Platform.OS !== 'ios') throw new Error('Sign in with Apple is only available on iOS');
  const AppleAuthentication = await import('expo-apple-authentication');
  let credential: Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return; // user dismissed the sheet, not an error
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple sign-in did not return an identity token');
  const { error } = await authClient.signIn.social({ provider: 'apple', idToken: { token: credential.identityToken } });
  if (error) throw new Error(messageOf(error, 'Apple sign-in failed'));
}

/** Native: `@react-native-google-signin/google-signin` gets the ID token, verified the same no-redirect
 * way as Apple. Web: the normal OAuth redirect (PLAN.md), whose callback lands on the Convex site URL. */
export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    if (error) throw new Error(messageOf(error, 'Google sign-in failed'));
    return;
  }

  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response) || !response.data.idToken) throw new Error('Google did not return an identity token');
    const { error } = await authClient.signIn.social({ provider: 'google', idToken: { token: response.data.idToken } });
    if (error) throw new Error(messageOf(error, 'Google sign-in failed'));
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return; // user dismissed the sheet
    throw e;
  }
}

/** Kids without Apple/Google, and the shared first step of the invite flow in general (PLAN.md →
 * Sign-in): an anonymous Better Auth session, then `invites.redeem` (with the 5-digit parent code for a
 * kid) links it to a `members` row. `demo.signInAs` (Demo mode) reuses the same anonymous identity. */
export async function signInAnonymously(): Promise<void> {
  const { error } = await authClient.signIn.anonymous();
  if (error) throw new Error(messageOf(error, 'Could not start a session'));
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}
