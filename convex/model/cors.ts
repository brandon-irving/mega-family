// Shared CORS policy for the backend's own hand-written HTTP route (`/chat-stream`) — the same
// `trustedOrigins()` list Better Auth's routes use (convex/auth.ts), so the policy can't drift between
// the two. A wildcard `Access-Control-Allow-Origin: *` on a route that streams a signed-in member's own
// chat would let any website read it cross-origin; echoing back only a trusted Origin (exactly what
// Better Auth's own `cors: true` does for its routes) keeps the same protection consistent everywhere.
import { trustedOrigins } from '../auth';

/** The request's `Origin`, only if it's one this deployment trusts — otherwise null, meaning "no CORS
 * header at all" rather than a wildcard. */
export function corsOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  return trustedOrigins().includes(origin) ? origin : null;
}

/** Sets `Access-Control-Allow-Origin` on `response` to the request's origin if (and only if) it's
 * trusted; leaves the response untouched otherwise. */
export function withCors(request: Request, response: Response): Response {
  const origin = corsOrigin(request);
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  return response;
}
