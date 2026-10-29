// G5 review fixes (security S1/S2, UX U1) for the schedule-link fetcher, against a fake `fetch` (never the network).
// S1: every hop is re-validated (https/webcal only, no private/loopback/link-local/ULA/CGNAT IP literals, no
//     localhost/.local/.internal), redirects are followed by hand (`redirect: 'manual'`), at most ICS.maxRedirects.
// S2: the body is read as a stream with a running byte count and abandoned past `maxBytes`, whatever
//     Content-Length says (or doesn't).
// U1: the whole fetch (every hop + the body) is bounded by `timeoutMs`, and a link that can't be reached says so
//     (`detail: 'unreachable'`), distinct from "not a calendar" / "too large" / "refused".
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ICS } from '../../shared/config/onboarding';
import { icsFetchUrl, icsHttpFetcher } from './icsHttp';

type Hop = { status?: number; headers?: Record<string, string>; body?: string | ReadableStream<Uint8Array> };
let calls: { url: string; init?: RequestInit }[] = [];

function stubFetch(handler: (url: string, init?: RequestInit) => Hop | Promise<Hop>) {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = await handler(String(url), init);
    return new Response(r.body ?? null, { status: r.status ?? 200, headers: r.headers });
  });
}

afterEach(() => vi.unstubAllGlobals());

const CAL = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';

describe('S1: schedule links never reach private addresses', () => {
  test.each([
    'https://127.0.0.1/a.ics',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.1.2.3/a.ics',
    'https://172.16.0.1/a.ics',
    'https://172.31.255.255/a.ics',
    'https://192.168.1.1/a.ics',
    'https://100.64.0.1/a.ics',
    'https://0.0.0.0/a.ics',
    'https://2130706433/a.ics', // decimal 127.0.0.1
    'https://0x7f.0.0.1/a.ics', // hex
    'https://0177.0.0.1/a.ics', // octal
    'https://[::1]/a.ics',
    'https://[::]/a.ics',
    'https://[::ffff:127.0.0.1]/a.ics', // IPv4-mapped
    'https://[::ffff:a9fe:a9fe]/a.ics', // IPv4-mapped 169.254.169.254
    'https://[fc00::1]/a.ics',
    'https://[fd12:3456::1]/a.ics',
    'https://[fe80::1]/a.ics',
    'https://localhost/a.ics',
    'https://api.localhost/a.ics',
    'https://printer.local/a.ics',
    'https://metadata.google.internal/a.ics',
    'webcal://127.0.0.1/a.ics',
  ])('%s is refused', (raw) => {
    expect(icsFetchUrl(raw)).toBeNull();
  });

  test('public hosts and public IPs still pass', () => {
    expect(icsFetchUrl('https://calendar.google.com/calendar/ical/x/public/basic.ics')).toBe('https://calendar.google.com/calendar/ical/x/public/basic.ics');
    expect(icsFetchUrl('https://8.8.8.8/a.ics')).toBe('https://8.8.8.8/a.ics');
    expect(icsFetchUrl('https://172.32.0.1/a.ics')).toBe('https://172.32.0.1/a.ics');
  });

  test('redirects are followed by hand and a hop to a private address is refused without being requested', async () => {
    stubFetch((url) => (url.startsWith('https://attacker.example') ? { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/iam/' } } : { body: 'secret' }));
    const r = await icsHttpFetcher.fetch({ url: 'https://attacker.example/cal.ics', maxBytes: ICS.maxBytes, timeoutMs: 1000 });
    expect(r).toMatchObject({ ok: false, detail: 'refused' });
    expect(calls.map((c) => c.url)).toEqual(['https://attacker.example/cal.ics']);
    expect(calls[0].init?.redirect).toBe('manual');
  });

  test('a redirect to an https loopback literal is refused too', async () => {
    stubFetch(() => ({ status: 301, headers: { location: 'https://127.0.0.1:8443/admin' } }));
    expect(await icsHttpFetcher.fetch({ url: 'https://attacker.example/cal.ics', maxBytes: ICS.maxBytes, timeoutMs: 1000 })).toMatchObject({ ok: false, detail: 'refused' });
    expect(calls).toHaveLength(1);
  });

  test('a redirect to another public https host is followed (relative Location resolved), conditional headers kept', async () => {
    stubFetch((url): Hop => (url === 'https://school.example.org/feed.ics' ? { status: 302, headers: { location: '/v2/feed.ics' } } : { body: CAL, headers: { etag: '"v3"' } }));
    const r = await icsHttpFetcher.fetch({ url: 'https://school.example.org/feed.ics', etag: '"v2"', maxBytes: ICS.maxBytes, timeoutMs: 1000 });
    expect(r).toEqual({ ok: true, notModified: false, text: CAL, etag: '"v3"', lastModified: undefined });
    expect(calls.map((c) => c.url)).toEqual(['https://school.example.org/feed.ics', 'https://school.example.org/v2/feed.ics']);
    expect(calls[1].init?.headers).toMatchObject({ 'If-None-Match': '"v2"' });
  });

  test(`more than ICS.maxRedirects (${ICS.maxRedirects}) hops is refused`, async () => {
    let n = 0;
    stubFetch(() => ({ status: 302, headers: { location: `https://hop${++n}.example.org/a.ics` } }));
    expect(await icsHttpFetcher.fetch({ url: 'https://start.example.org/a.ics', maxBytes: ICS.maxBytes, timeoutMs: 1000 })).toMatchObject({ ok: false, detail: 'refused' });
    expect(calls).toHaveLength(ICS.maxRedirects + 1);
  });
});

describe('S2: the size cap is enforced while reading', () => {
  test('a body with no Content-Length is abandoned once more than maxBytes have arrived', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(100).fill(65);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 1000) controller.close();
        else controller.enqueue(chunk);
      },
    });
    stubFetch(() => ({ body: stream }));
    const r = await icsHttpFetcher.fetch({ url: 'https://cal.example.org/a.ics', maxBytes: 450, timeoutMs: 1000 });
    expect(r).toMatchObject({ ok: false, failure: 'error', detail: 'too_large' });
    expect(pulled).toBeLessThan(20);
  });

  test('a lying small Content-Length does not let a big body through', async () => {
    stubFetch(() => ({ body: 'BEGIN:VCALENDAR\r\n' + 'X'.repeat(5000), headers: { 'content-length': '10' } }));
    expect(await icsHttpFetcher.fetch({ url: 'https://cal.example.org/a.ics', maxBytes: 1000, timeoutMs: 1000 })).toMatchObject({ ok: false, detail: 'too_large' });
  });

  test('multi-byte text is decoded correctly across chunks', async () => {
    const bytes = new TextEncoder().encode('BEGIN:VCALENDAR\r\nSUMMARY:Café\r\nEND:VCALENDAR');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const cut = bytes.indexOf(0xc3) + 1; // split inside "é"
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    stubFetch(() => ({ body: stream }));
    expect(await icsHttpFetcher.fetch({ url: 'https://cal.example.org/a.ics', maxBytes: 1000, timeoutMs: 1000 })).toMatchObject({ ok: true, text: 'BEGIN:VCALENDAR\r\nSUMMARY:Café\r\nEND:VCALENDAR' });
  });
});

describe('U1: an unreachable link fails fast and says so', () => {
  test('a server that never answers is given up on at timeoutMs with detail "unreachable"', async () => {
    stubFetch(
      (_url, init) =>
        new Promise<Hop>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    const started = performance.now();
    const r = await icsHttpFetcher.fetch({ url: 'https://slow.example.org/a.ics', maxBytes: 1000, timeoutMs: 60 });
    expect(r).toMatchObject({ ok: false, detail: 'unreachable' });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test('a body that stalls after the headers is also bounded by timeoutMs', async () => {
    stubFetch((_url, init) => ({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('BEGIN:VCALENDAR\r\n'));
          init?.signal?.addEventListener('abort', () => controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        },
      }),
    }));
    const started = performance.now();
    expect(await icsHttpFetcher.fetch({ url: 'https://slow.example.org/a.ics', maxBytes: 1000, timeoutMs: 60 })).toMatchObject({ ok: false, detail: 'unreachable' });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test('a network error is "unreachable"; HTTP 404 is "unreachable" with failure no_result', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect(await icsHttpFetcher.fetch({ url: 'https://gone.example.org/a.ics', maxBytes: 1000, timeoutMs: 1000 })).toMatchObject({ ok: false, failure: 'error', detail: 'unreachable' });
    stubFetch(() => ({ status: 404 }));
    expect(await icsHttpFetcher.fetch({ url: 'https://gone.example.org/a.ics', maxBytes: 1000, timeoutMs: 1000 })).toMatchObject({ ok: false, failure: 'no_result', detail: 'unreachable' });
  });
});
