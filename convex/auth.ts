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
import { importPKCS8, SignJWT } from 'jose';
import { DEMO } from '../shared/config';
import { IDENTITY } from '../shared/config/identity';
import authConfig from './auth.config';
import { emailAndPasswordOptions } from './model/authOptions';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

export const authComponent = createClient<DataModel>(components.betterAuth);

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Apple's client "secret" is a JWT MEGA signs itself (no static secret to leak), good for 180 days — under
 * Apple's 6-month cap. Needs APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY_B64 / APPLE_CLIENT_ID. */
async function generateAppleClientSecret(): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const keyB64 = process.env.APPLE_PRIVATE_KEY_B64;
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!teamId || !keyId || !keyB64 || !clientId) throw new Error('Apple sign-in needs APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_B64 and APPLE_CLIENT_ID set on this deployment');
  const key = await importPKCS8(base64ToUtf8(keyB64), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime('180d')
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .sign(key);
}

// Better Auth's documented pattern for this is an async `clientSecret` hook (current docs: "Better Auth's
// async provider configuration"), but the pinned stable `better-auth` release in this repo's package.json
// (1.7.x) still types `clientSecret` as a plain `string` — only the 1.8 beta line adds the function form.
// Rather than pin a beta dependency, this generates the JWT once per cold start into a module-level cache
// (fire-and-forget, never blocks module load) and reads the cached string synchronously; the JWT is valid
// for 180 days, so recomputing it per-request would be wasteful even with the function form. If Apple env
// vars aren't set yet, the cache just stays empty and only Apple sign-in is affected (Google/anonymous
// aren't touched). Revisit this once `better-auth`'s stable line ships the async form.
let appleClientSecretCache = '';
void generateAppleClientSecret()
  .then((s) => {
    appleClientSecretCache = s;
  })
  .catch((e) => console.error('[auth] Apple client secret not generated:', (e as Error).message));

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
      apple: {
        clientId: process.env.APPLE_CLIENT_ID ?? '',
        appBundleIdentifier: IDENTITY.bundleId,
        clientSecret: appleClientSecretCache,
      },
    },
    plugins: [expo(), anonymous(), crossDomain({ siteUrl }), convex({ authConfig })],
  });
