// HTTP routes: Better Auth's own routes, the chat stream (CONTRACT §4 `chat.stream`), and demo sign-in
// (Milestone C decision below — DEMO_MODE-gated, documented in the final report as an additive contract
// change since it's a new function surface, not one CONTRACT.md's §4 lists).
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { authComponent, createAuth } from './auth';
import { streamChat } from './chat';
import { DEMO } from '../shared/config';
import { SAMPLE_FAMILY } from '../shared/fixtures/sampleFamily';

const http = httpRouter();

// `registerRoutesLazy` (not `registerRoutes`) defers initializing Better Auth until a request actually
// hits one of its routes, which keeps convex/http.ts's own memory footprint small (current docs'
// recommendation, to avoid out-of-memory deploys as the app grows).
authComponent.registerRoutesLazy(http, createAuth, { basePath: '/api/auth', cors: true, trustedOrigins: [process.env.SITE_URL ?? ''] });

http.route({
  path: '/chat-stream',
  method: 'POST',
  handler: streamChat,
});
http.route({
  path: '/chat-stream',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, request) => {
    const h = request.headers;
    if (h.get('Origin') !== null && h.get('Access-Control-Request-Method') !== null && h.get('Access-Control-Request-Headers') !== null) {
      return new Response(null, {
        headers: new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Digest, Authorization',
          'Access-Control-Max-Age': '86400',
        }),
      });
    }
    return new Response();
  }),
});

/** Demo sign-in (web only, no OAuth): signs in anonymously through Better Auth, then links that session's
 * subject to one of the seeded sample members so `members.by_authId` resolves it. Impossible unless
 * `DEMO_MODE` is exactly `"true"` on this deployment — never on by default, never in prod. This is new
 * surface beyond CONTRACT.md §4 (an `h`-kind route, like `chat.stream`), logged in the final report as a
 * pending additive contract change rather than silently added. */
http.route({
  path: '/demo-signin',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (process.env[DEMO.envVar] !== 'true') return new Response('demo mode is off', { status: 403 });
    const body = (await request.json().catch(() => null)) as { as?: string } | null;
    const key = body?.as;
    const sample = SAMPLE_FAMILY.members.find((m) => m.key === key && m.login);
    if (!sample) return new Response('unknown sample member', { status: 400 });

    // Sign in anonymously (no credentials needed), then relink that fresh identity to the sample member's
    // pre-seeded `authId` ("sample:<key>") so `members.by_authId` resolves it on the next request.
    const auth = createAuth(ctx);
    const signInResponse = await auth.handler(new Request(`${new URL(request.url).origin}/api/auth/sign-in/anonymous`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }));
    if (!signInResponse.ok) return new Response('demo sign-in failed', { status: 502 });
    const bodyText = await signInResponse.text(); // read once: forwarding `.body` after `.json()` would double-consume the stream
    const { user } = JSON.parse(bodyText) as { user?: { id: string } };
    if (user?.id) await ctx.runMutation(internal.auth.linkSampleMember, { key: sample.key, authId: user.id });

    const headers = new Headers(signInResponse.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(bodyText, { status: signInResponse.status, headers });
  }),
});

export default http;
