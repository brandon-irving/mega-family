// Shared plumbing for the Google read APIs (Gmail, Calendar): one authorized GET with a timeout, mapped onto the
// ports' fail-closed failures. 401 → `unauthorized` (the access token was rejected: revoked); the caller treats
// it like a lapsed grant. The status comes back too, because both APIs use one for "start over" (Gmail 404 on a
// stale history id, Calendar 410 on an expired sync token). Never puts the URL or the token in `detail`.
import { GOOGLE } from '../../shared/config/google';
import type { IntegrationFailure } from '../ports/integrationResult';

export type GoogleGet = { ok: true; json: unknown } | { ok: false; status: number; failure: IntegrationFailure; detail: string };

export async function googleGet(url: string, accessToken: string): Promise<GoogleGet> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE.timeoutMs);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) {
      const failure: IntegrationFailure = res.status === 401 ? 'unauthorized' : res.status === 429 ? 'rate_limited' : res.status === 404 ? 'no_result' : 'error';
      return { ok: false, status: res.status, failure, detail: `HTTP ${res.status}` };
    }
    return { ok: true, json: await res.json() };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, status: 0, failure: 'error', detail: aborted ? 'timed out' : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

/** The URL with its query string, built from defined params only (arrays repeat the key). */
export function withQuery(base: string, params: Record<string, string | number | boolean | undefined | string[]>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) q.append(k, item);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
