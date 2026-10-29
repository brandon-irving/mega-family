// The real IcsFetcher adapter (G5): downloads a schedule link. `webcal://` is the same feed over https; plain
// http is refused (the link can carry a private token). Conditional GET with the stored ETag / Last-Modified,
// so an unchanged feed costs a 304 and no parse. Never puts the URL in `detail`: a schedule link is a credential.
// v0.17b (G5 review): the server fetches a user-supplied link, so
//  - S1: every hop is checked (scheme + host, `hostGuard`), redirects are followed by hand (`redirect: 'manual'`)
//    and at most ICS.maxRedirects of them;
//  - S2: the body is read as a stream with a running byte count and dropped past `maxBytes` (Content-Length is
//    not trusted);
//  - U1: one deadline covers every hop and the body; `detail` says why it failed (ICS_FAILURE_REASONS).
import { ICS, type ICS_FAILURE_REASONS } from '../../shared/config/onboarding';
import type { IcsFetcher } from '../ports/icsFetcher';
import { isBlockedHost } from './hostGuard';

type Reason = (typeof ICS_FAILURE_REASONS)[number];

const BLOCK_LISTS = { hostnames: ICS.blockedHostnames, suffixes: ICS.blockedHostSuffixes, ipv4: ICS.blockedIpv4, ipv6: ICS.blockedIpv6 };

/** `webcal://x` → `https://x`; null for anything that isn't https/webcal, isn't a URL, or names a private host. */
export function icsFetchUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!(ICS.allowedSchemes as readonly string[]).includes(url.protocol)) return null;
  if (url.protocol === 'webcal:') {
    try {
      url = new URL(`https://${raw.trim().slice('webcal://'.length)}`);
    } catch {
      return null;
    }
  }
  if (url.username || url.password) return null;
  if (isBlockedHost(url.hostname, BLOCK_LISTS)) return null;
  return url.toString();
}

/** Reads a body stream up to `maxBytes`; null once it goes past (the rest is never read). */
async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const failWith = (reason: Reason, failure: 'error' | 'no_result' | 'rate_limited' = 'error') => ({ ok: false as const, failure, detail: reason });

export const icsHttpFetcher: IcsFetcher = {
  async fetch({ url, etag, lastModified, maxBytes, timeoutMs }) {
    let target = icsFetchUrl(url);
    if (!target) return failWith('refused');
    const headers: Record<string, string> = { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' };
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (let hop = 0; ; hop++) {
        const res = await fetch(target, { headers, signal: controller.signal, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400 && res.status !== 304) {
          await res.body?.cancel().catch(() => undefined);
          const location = res.headers.get('location');
          if (!location || hop >= ICS.maxRedirects) return failWith('refused');
          let next: string;
          try {
            next = new URL(location, target).toString();
          } catch {
            return failWith('refused');
          }
          const checked = icsFetchUrl(next);
          if (!checked) return failWith('refused');
          target = checked;
          continue;
        }
        // A runtime that can't hand back the redirect itself (an opaque redirect) is refused, never followed blind.
        if (res.type === 'opaqueredirect' || res.status === 0) return failWith('refused');
        if (res.status === 304) return { ok: true, notModified: true };
        if (!res.ok) return failWith('unreachable', res.status === 429 ? 'rate_limited' : res.status === 404 || res.status === 410 ? 'no_result' : 'error');
        const text = await readCapped(res, maxBytes);
        if (text === null) return failWith('too_large');
        return { ok: true, notModified: false, text, etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined };
      }
    } catch {
      // Timed out (the abort) or the network failed: either way the link couldn't be reached.
      return failWith('unreachable');
    } finally {
      clearTimeout(timer);
    }
  },
};
