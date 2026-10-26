// HTTP routes: Better Auth's own routes. (Chat replies are server-driven since G1 — see convex/chat.ts — so
// there is no client-driven stream route.) Demo sign-in
// used to live here (`/demo-signin`) but is now the contract function `demo.signInAs` (convex/demo.ts,
// CONTRACT.md §4 "Demo", v0.4 pending approval) — a plain Convex route gave it no args/returns checking
// and no privacy-grid coverage, unlike every other function in this backend.
import { httpRouter } from 'convex/server';
import { authComponent, createAuth, trustedOrigins } from './auth';

const http = httpRouter();

// `registerRoutesLazy` (not `registerRoutes`) defers initializing Better Auth until a request actually
// hits one of its routes, which keeps convex/http.ts's own memory footprint small (current docs'
// recommendation, to avoid out-of-memory deploys as the app grows). Same `trustedOrigins` as `createAuth`
// itself (convex/auth.ts) — one definition, so the CORS policy and Better Auth's own origin checks never
// drift apart.
authComponent.registerRoutesLazy(http, createAuth, { basePath: '/api/auth', cors: true, trustedOrigins: trustedOrigins() });

export default http;
