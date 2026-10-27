// HTTP routes: Better Auth's own routes, plus `POST /push/answer` (CONTRACT §5 v0.11). (Chat replies are
// server-driven since G1 — see convex/chat.ts — so there is no client-driven stream route.) Demo sign-in
// used to live here (`/demo-signin`) but is now the contract function `demo.signInAs` (convex/demo.ts,
// CONTRACT.md §4 "Demo", v0.4 pending approval) — a plain Convex route gave it no args/returns checking
// and no privacy-grid coverage, unlike every other function in this backend.
import { httpRouter } from 'convex/server';
import { authComponent, createAuth, trustedOrigins } from './auth';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction } from './_generated/server';
import { verifyAnswerToken } from './model/pushAnswerToken';

const http = httpRouter();

// `registerRoutesLazy` (not `registerRoutes`) defers initializing Better Auth until a request actually
// hits one of its routes, which keeps convex/http.ts's own memory footprint small (current docs'
// recommendation, to avoid out-of-memory deploys as the app grows). Same `trustedOrigins` as `createAuth`
// itself (convex/auth.ts) — one definition, so the CORS policy and Better Auth's own origin checks never
// drift apart.
authComponent.registerRoutesLazy(http, createAuth, { basePath: '/api/auth', cors: true, trustedOrigins: trustedOrigins() });

/** One fixed response for every failure (malformed body, unknown notification, locked out, wrong/expired
 * token, unknown button) — CONTRACT §5 v0.11's "no oracle" requirement: nothing in the response should let
 * a caller tell those cases apart. */
function genericError(): Response {
  return new Response(JSON.stringify({ error: 'invalid request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

/** `POST /push/answer` (CONTRACT §5 v0.11): answers a notification using the HMAC-signed `answerToken`
 * from its push payload instead of a signed-in session — for iOS's background notification-response task,
 * which runs headless with no Better Auth session to call `notifications.answer` through (PLAN.md's push
 * section: "check on day 3 that an answer is recorded when the app has been killed"). Idempotent the same
 * way `notifications.answer` is (convex/model/notificationAnswer.ts) — a retried call never re-applies the
 * button's effect. */
http.route({
  path: '/push/answer',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    let body: { notificationId?: unknown; buttonId?: unknown; answerToken?: unknown };
    try {
      body = await request.json();
    } catch {
      return genericError();
    }
    if (typeof body.notificationId !== 'string' || typeof body.buttonId !== 'string' || typeof body.answerToken !== 'string') return genericError();

    try {
      const notificationId = body.notificationId as Id<'notifications'>;
      const context = await ctx.runQuery(internal.pushAnswer.loadForToken, { notificationId });
      const usable = !!context && !context.lockedOut;
      // S4 (LOW, G3 security review): always run the HMAC verify — even for a notification that doesn't
      // exist or is already locked out — using a placeholder recipient when there's no real `context`, so
      // a "not found"/"locked out" response costs the same CPU time (one `crypto.subtle.verify` call) as a
      // "wrong token" response. Before this, those two cases returned `genericError()` immediately, before
      // ever touching the HMAC — identical response BODIES, but measurably different response TIMES, which
      // is itself an oracle an attacker can use to tell "this notification doesn't exist" apart from "it
      // exists but my token's wrong" without the body ever saying so. `now: 0` for the placeholder case is
      // deliberately inert (any real token's `expiresAt` is a future epoch ms, so the "not expired" check
      // still passes and the real signature comparison still runs) — never `Date.now()`, since the point is
      // only to match the real branch's shape of work, not to compute a real instant.
      const placeholderRecipientId = notificationId as unknown as Id<'members'>;
      const valid = await verifyAnswerToken(body.answerToken, notificationId, context?.recipientId ?? placeholderRecipientId, context?.now ?? 0);
      if (!usable) return genericError();

      if (!valid) {
        await ctx.runMutation(internal.pushAnswer.recordFailedAttempt, { notificationId });
        return genericError();
      }

      const result = await ctx.runMutation(internal.pushAnswer.answerViaToken, { notificationId, buttonId: body.buttonId, now: context!.now });
      if (!result) return genericError();
      return new Response(JSON.stringify({ reply: result.reply }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch {
      // A malformed notificationId (wrong table, bad shape) throws from `ctx.runQuery` itself — same
      // generic response, never a 500 that would leak that the id was even well-formed enough to look up.
      return genericError();
    }
  }),
});

export default http;
