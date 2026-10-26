// Required by `@convex-dev/better-auth`'s Convex plugin (`convex({ authConfig })` in auth.ts): registers
// Convex's own JWT verification as an identity provider, so `ctx.auth.getUserIdentity()` recognizes Better
// Auth's session tokens. Missing this file is the #1 Better Auth footgun — sign-in "succeeds" but every
// Convex function sees `getUserIdentity() === null` forever, with no error anywhere.
import { type AuthConfig } from 'convex/server';
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config';

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
