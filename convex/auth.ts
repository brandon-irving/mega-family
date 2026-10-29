// PLAN.md → Sign-in. Better Auth through the Convex component, behind the same "server decides who you
// are" rule as everything else: `convex/model/viewer.ts` maps `ctx.auth.getUserIdentity().subject` to a
// `members` row, and that's the only input to every permission check in this backend.
//
// Kids without Apple/Google (decided): the `anonymous` plugin, not a custom endpoint. A kid's device signs
// in anonymously (no credentials) to get *a* Better Auth identity, then calls `invites.redeem` with the
// invite token and the 5-digit parent code to link that identity's subject to their `members` row — the
// same redeem path an adult's Apple/Google sign-in uses. No schema changes, and it's one of Better Auth's
// officially supported Convex-component plugins (checked against current docs).
import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth/minimal';
import { anonymous } from 'better-auth/plugins';
import { DEMO } from '../shared/config';
import { IDENTITY } from '../shared/config/identity';
import authConfig from './auth.config';
import { emailAndPasswordOptions } from './model/authOptions';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

export const authComponent = createClient<DataModel>(components.betterAuth);

/** Sign in with Apple's client secret is an ES256 JWT (Apple: "Creating a client secret"), valid 180 days.
 * `scripts/secrets.mjs sync-convex` signs it from the .p8 key and sets APPLE_CLIENT_SECRET; Better Auth's
 * Apple docs allow a static `clientSecret`. It isn't signed here at startup because Convex never finishes
 * async work started at module load, so a module-level cache stayed empty and Apple sign-in (web and the
 * native idToken path) always failed with CLIENT_ID_AND_SECRET_REQUIRED (found Oct 29). */
export function appleOptions() {
  return {
    clientId: process.env.APPLE_CLIENT_ID ?? '',
    appBundleIdentifier: IDENTITY.bundleId,
    clientSecret: process.env.APPLE_CLIENT_SECRET ?? '',
  };
}

/** `trustedOrigins` for both Better Auth itself (OAuth callback / cross-domain validation) and the HTTP
 * router's CORS config (convex/http.ts): the native app's deep-link scheme and Apple's redirect always;
 * `http://localhost:*` web dev origins only on a deployment that opted into DEMO_MODE (this repo's one
 * existing flag for "this deployment is for local/demo use", not a separate one invented for this). A
 * real production web deployment sets `SITE_URL` to its own domain and never gets the localhost origins. */
export function trustedOrigins(): string[] {
  const base = [`${IDENTITY.scheme}://`, 'https://appleid.apple.com', process.env.SITE_URL ?? ''].filter(Boolean);
  if (process.env[DEMO.envVar] !== 'true') return base;
  return [...base, 'http://localhost:8081', 'http://localhost:19006', 'http://127.0.0.1:8081'];
}

// SITE_URL is the web app's own address (Convex Better Auth docs: React/Expo-web guides), e.g.
// http://localhost:8081 in development; crossDomain uses it to hand the web client its session through the
// Set-Better-Auth-Cookie header, since a browser won't send convex.site cookies back from another origin.
const siteUrl = process.env.SITE_URL ?? '';

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: trustedOrigins(),
    database: authComponent.adapter(ctx),
    // Screen 9 redesign (owner, Oct 28): email + password next to Apple and Google.
    emailAndPassword: emailAndPasswordOptions(),
    socialProviders: {
      google: {
        clientId: [process.env.GOOGLE_WEB_CLIENT_ID ?? '', process.env.GOOGLE_IOS_CLIENT_ID ?? ''],
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      },
      apple: appleOptions(),
    },
    plugins: [expo(), anonymous(), crossDomain({ siteUrl }), convex({ authConfig })],
  });
