// Shared plumbing for the G4 integration adapters (web search, weather, directions, geocoding): one `fetch`
// with a timeout, mapped onto the ports' fail-closed `IntegrationFailure` codes. Adapters never throw a vendor
// error at feature code (convex/ports/integrationResult.ts); they return `{ ok: false, failure }` instead.
import type { IntegrationFailure } from '../ports/integrationResult';

export type FetchOutcome = { ok: true; status: number; json: unknown } | { ok: false; failure: IntegrationFailure; status?: number; detail: string };

/** HTTP status → failure code: 429 is rate limiting, anything else that isn't 2xx is a provider error. */
export function failureForStatus(status: number): IntegrationFailure {
  return status === 429 ? 'rate_limited' : 'error';
}

/** GET/POST JSON with an abort timeout. Never includes the URL in `detail` (it can carry an access token). */
export async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return { ok: false, failure: failureForStatus(res.status), status: res.status, detail: `HTTP ${res.status}` };
    return { ok: true, status: res.status, json: await res.json() };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, failure: 'error', detail: aborted ? 'timed out' : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}
