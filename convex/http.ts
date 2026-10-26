// HTTP routes: Better Auth's own routes and the chat stream (CONTRACT §4 `chat.stream`). Demo sign-in
// used to live here (`/demo-signin`) but is now the contract function `demo.signInAs` (convex/demo.ts,
// CONTRACT.md §4 "Demo", v0.4 pending approval) — a plain Convex route gave it no args/returns checking
// and no privacy-grid coverage, unlike every other function in this backend.
import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { authComponent, createAuth, trustedOrigins } from './auth';
import { streamChat } from './chat';
import { corsOrigin } from './model/cors';

const http = httpRouter();

// `registerRoutesLazy` (not `registerRoutes`) defers initializing Better Auth until a request actually
// hits one of its routes, which keeps convex/http.ts's own memory footprint small (current docs'
// recommendation, to avoid out-of-memory deploys as the app grows). Same `trustedOrigins` as `createAuth`
// itself (convex/auth.ts) — one definition, so the CORS policy and Better Auth's own origin checks never
// drift apart.
authComponent.registerRoutesLazy(http, createAuth, { basePath: '/api/auth', cors: true, trustedOrigins: trustedOrigins() });

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
      // Same trustedOrigins policy as the auth routes (convex/auth.ts) — no wildcard, and no
      // Access-Control-Allow-Origin header at all for an origin that isn't trusted.
      const origin = corsOrigin(request);
      return new Response(null, {
        headers: new Headers({
          ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Digest, Authorization',
          'Access-Control-Max-Age': '86400',
        }),
      });
    }
    return new Response();
  }),
});

export default http;
