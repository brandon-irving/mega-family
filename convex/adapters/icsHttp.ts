// The real IcsFetcher adapter (G5): downloads a schedule link. `webcal://` is the same feed over https; plain
// http is refused (the link can carry a private token). Conditional GET with the stored ETag / Last-Modified,
// so an unchanged feed costs a 304 and no parse. Capped at `maxBytes` (Content-Length first, then the text).
// Never puts the URL in `detail`: a schedule link is a credential.
import { ICS } from '../../shared/config/onboarding';
import type { IcsFetcher } from '../ports/icsFetcher';

/** `webcal://x` → `https://x`; null for anything that isn't https/webcal or isn't a URL. */
export function icsFetchUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!(ICS.allowedSchemes as readonly string[]).includes(url.protocol)) return null;
  if (url.protocol === 'webcal:') return `https://${raw.trim().slice('webcal://'.length)}`;
  return url.toString();
}

export const icsHttpFetcher: IcsFetcher = {
  async fetch({ url, etag, lastModified, maxBytes, timeoutMs }) {
    const target = icsFetchUrl(url);
    if (!target) return { ok: false, failure: 'error', detail: 'not an https or webcal link' };
    const headers: Record<string, string> = { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' };
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(target, { headers, signal: controller.signal, redirect: 'follow' });
      if (res.status === 304) return { ok: true, notModified: true };
      if (!res.ok) return { ok: false, failure: res.status === 429 ? 'rate_limited' : res.status === 404 ? 'no_result' : 'error', detail: `HTTP ${res.status}` };
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > maxBytes) return { ok: false, failure: 'error', detail: 'too large' };
      const text = await res.text();
      if (text.length > maxBytes) return { ok: false, failure: 'error', detail: 'too large' };
      return { ok: true, notModified: false, text, etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { ok: false, failure: 'error', detail: aborted ? 'timed out' : 'network error' };
    } finally {
      clearTimeout(timer);
    }
  },
};
