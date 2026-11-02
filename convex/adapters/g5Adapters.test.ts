// G5 real adapters (Google OAuth, Gmail, Google Calendar, schedule-link fetch) against recorded-shape fixtures and
// a fake `fetch` — never the network. Shapes follow the providers' current docs (re-checked Oct 29): the OAuth
// token endpoint's JSON and `invalid_grant` error, Gmail users.history.list (404 on a stale start id) and
// users.messages.get?format=full (MIME tree, base64url bodies), Calendar events.list (410 on an expired sync
// token, `date` vs `dateTime`, `status: "cancelled"`).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GOOGLE } from '../../shared/config/google';
import { ICS } from '../../shared/config/onboarding';
import { zonedInstant } from '../../shared/time';
import { bodyText, gmailMailSource, parseFrom } from './gmail';
import { googleCalendarSource, toExternalEvent } from './googleCalendar';
import { emailFromIdToken, googleOAuth } from './googleOAuth';
import { icsFetchUrl, icsHttpFetcher } from './icsHttp';

const TZ = 'America/New_York';
const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idToken = (claims: object) => `h.${b64url(JSON.stringify(claims))}.sig`;

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; json?: unknown; text?: string; headers?: Record<string, string> }) {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = handler(String(url), init);
    const status = r.status ?? 200;
    const body = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : '');
    return new Response(status === 304 ? null : body, { status, headers: r.headers });
  });
}

beforeEach(() => {
  process.env.GOOGLE_WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  process.env.INTEGRATION_TOKEN_KEY = b64url('k'.repeat(32));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_WEB_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.INTEGRATION_TOKEN_KEY;
});

describe('googleOAuth', () => {
  test('the consent URL asks for offline, read-only access with a fresh refresh token and our state', () => {
    const url = new URL(googleOAuth.authUrl({ scopes: ['openid', 'email', GOOGLE.scopes.gmail], state: 'nonce123', redirectUri: 'https://x.convex.site/google/oauth/callback', loginHint: 'a@example.com' }));
    expect(url.origin + url.pathname).toBe(GOOGLE.authUrl);
    const p = Object.fromEntries(url.searchParams);
    expect(p).toMatchObject({ client_id: 'web-client.apps.googleusercontent.com', response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: 'nonce123', login_hint: 'a@example.com' });
    expect(p.scope).toBe(`openid email ${GOOGLE.scopes.gmail}`);
    expect(p.client_secret).toBeUndefined();
  });

  test('code exchange: tokens, the scopes actually granted, and the account email from the id_token', async () => {
    mockFetch(() => ({ json: { access_token: 'at', expires_in: 3599, refresh_token: 'rt', scope: `openid ${GOOGLE.scopes.gmail}`, id_token: idToken({ email: 'demo@example.com' }) } }));
    const r = await googleOAuth.exchangeCode({ code: 'c', redirectUri: 'https://x/cb' });
    expect(r).toEqual({ ok: true, tokens: { accessToken: 'at', refreshToken: 'rt', expiresInSeconds: 3599, scopes: ['openid', GOOGLE.scopes.gmail], email: 'demo@example.com' } });
    const form = new URLSearchParams(String(calls[0].init?.body));
    expect(calls[0].url).toBe(GOOGLE.tokenUrl);
    expect(Object.fromEntries(form)).toEqual({ code: 'c', client_id: 'web-client.apps.googleusercontent.com', client_secret: 'client-secret', redirect_uri: 'https://x/cb', grant_type: 'authorization_code' });
  });

  test('refresh: invalid_grant (Testing mode lapse / revoked) is `unauthorized`; a 500 is `error`; never the token in detail', async () => {
    mockFetch(() => ({ status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }));
    expect(await googleOAuth.refresh({ refreshToken: 'secret-rt' })).toMatchObject({ ok: false, failure: 'unauthorized' });
    mockFetch(() => ({ status: 500, json: {} }));
    const r = await googleOAuth.refresh({ refreshToken: 'secret-rt' });
    expect(r).toMatchObject({ ok: false, failure: 'error' });
    expect(JSON.stringify(r)).not.toContain('secret-rt');
  });

  test('without the client secret or the token key it is not configured and never calls Google', async () => {
    delete process.env.INTEGRATION_TOKEN_KEY;
    mockFetch(() => ({ json: {} }));
    expect(googleOAuth.configured()).toBe(false);
    expect(await googleOAuth.exchangeCode({ code: 'c', redirectUri: '' })).toEqual({ ok: false, failure: 'not_configured' });
    expect(calls).toHaveLength(0);
  });

  test('revoke: 200 or an already-invalid token both count as done', async () => {
    mockFetch(() => ({ status: 400, json: { error: 'invalid_token' } }));
    expect(await googleOAuth.revoke({ token: 't' })).toEqual({ ok: true });
    expect(calls[0].url).toBe(GOOGLE.revokeUrl);
  });

  test('a malformed id_token gives no email (display only), never a throw', () => {
    expect(emailFromIdToken('not-a-jwt')).toBeUndefined();
    expect(emailFromIdToken(undefined)).toBeUndefined();
  });
});

describe('gmail', () => {
  test('history: inbox arrivals across pages and label changes, the new historyId; a 404 means a full sync', async () => {
    mockFetch((url) => {
      const u = new URL(url);
      if (u.searchParams.get('pageToken')) return { json: { history: [{ messagesAdded: [{ message: { id: 'm3' } }], labelsAdded: [{ message: { id: 'm4' }, labelIds: ['INBOX'] }, { message: { id: 'm1' }, labelIds: ['INBOX'] }, { message: { id: 'archived' }, labelIds: ['STARRED'] }] }], historyId: '120' } };
      return { json: { history: [{ messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] }], historyId: '110', nextPageToken: 'p2' } };
    });
    const r = await gmailMailSource.history({ accessToken: 'at', startHistoryId: '100', max: 50 });
    expect(r).toEqual({ ok: true, stale: false, messageIds: ['m1', 'm2', 'm3', 'm4'], historyId: '120' });
    const first = new URL(calls[0].url);
    expect(Object.fromEntries(first.searchParams)).toMatchObject({ startHistoryId: '100', labelId: 'INBOX' });
    expect(first.searchParams.getAll('historyTypes')).toEqual(['messageAdded', 'labelAdded']);
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer at' });

    mockFetch(() => ({ status: 404, json: { error: { code: 404 } } }));
    expect(await gmailMailSource.history({ accessToken: 'at', startHistoryId: '1', max: 50 })).toEqual({ ok: true, stale: true });
    mockFetch(() => ({ status: 401, json: {} }));
    expect(await gmailMailSource.history({ accessToken: 'at', startHistoryId: '1', max: 50 })).toMatchObject({ ok: false, failure: 'unauthorized' });
  });

  test('messages.get: From display name, Subject, plain text preferred over HTML, attachments skipped, body cut', async () => {
    const raw = {
      id: 'm1',
      threadId: 't1',
      internalDate: '1792944000000',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: '"Maple Elementary Office" <office@maple.example.org>' },
          { name: 'Subject', value: 'Picture day' },
        ],
        parts: [
          { mimeType: 'multipart/alternative', parts: [
            { mimeType: 'text/plain', body: { data: b64url('Picture day is Friday, Nov 6. Smile! ✨') } },
            { mimeType: 'text/html', body: { data: b64url('<p>HTML version</p>') } },
          ] },
          { mimeType: 'application/pdf', filename: 'form.pdf', body: { attachmentId: 'a1' } },
        ],
      },
    };
    mockFetch(() => ({ json: raw }));
    const r = await gmailMailSource.getMessage({ accessToken: 'at', id: 'm1', maxBodyChars: 20 });
    expect(r).toEqual({ ok: true, message: { id: 'm1', threadId: 't1', internalDate: 1792944000000, fromName: 'Maple Elementary Office', fromAddress: 'office@maple.example.org', subject: 'Picture day', text: 'Picture day is Frida' } });
    expect(new URL(calls[0].url).searchParams.get('format')).toBe('full');
  });

  test('an HTML-only body becomes readable text (no tags, no scripts)', () => {
    const text = bodyText({ mimeType: 'text/html', body: { data: b64url('<html><head><style>p{}</style></head><body><p>Bill due&nbsp;Nov 12</p><script>x()</script><br>Total: $48.00</body></html>') } });
    expect(text).toBe('Bill due Nov 12\nTotal: $48.00');
  });

  test('parseFrom handles a bare address too', () => {
    expect(parseFrom('billing@city.example.gov')).toEqual({ name: 'billing@city.example.gov', address: 'billing@city.example.gov' });
  });
});

describe('googleCalendar', () => {
  test('a full sync sends the window; an incremental one sends ONLY the sync token (Google rejects timeMin with it)', async () => {
    mockFetch(() => ({ json: { items: [], nextSyncToken: 's2' } }));
    await googleCalendarSource.listEvents({ accessToken: 'at', calendarId: 'primary', timeZone: TZ, timeMin: Date.UTC(2026, 9, 18), timeMax: Date.UTC(2026, 11, 25) });
    const full = new URL(calls[0].url).searchParams;
    expect(full.get('timeMin')).toBe('2026-10-18T00:00:00.000Z');
    expect(full.get('singleEvents')).toBe('true');
    await googleCalendarSource.listEvents({ accessToken: 'at', calendarId: 'primary', timeZone: TZ, syncToken: 's1', timeMin: 1, timeMax: 2 });
    const inc = new URL(calls[1].url).searchParams;
    expect(inc.get('syncToken')).toBe('s1');
    expect(inc.get('timeMin')).toBeNull();
    expect(inc.get('timeMax')).toBeNull();
  });

  test('410 Gone on a sync token → expired (the caller full-syncs)', async () => {
    mockFetch(() => ({ status: 410, json: {} }));
    expect(await googleCalendarSource.listEvents({ accessToken: 'at', calendarId: 'primary', timeZone: TZ, syncToken: 'old' })).toEqual({ ok: true, expired: true });
  });

  test('all-day events use the family timezone with an exclusive end; cancelled instances come through as cancelled', () => {
    expect(toExternalEvent({ id: 'a', summary: 'Book fair', start: { date: '2026-11-02' }, end: { date: '2026-11-04' } }, TZ)).toEqual({
      externalId: 'a',
      title: 'Book fair',
      start: zonedInstant('2026-11-02', 0, TZ),
      end: zonedInstant('2026-11-04', 0, TZ),
      allDay: '2026-11-02',
      cancelled: false,
    });
    expect(toExternalEvent({ id: 'b', status: 'cancelled' }, TZ)).toEqual({ externalId: 'b', title: 'Busy', start: 0, cancelled: true });
    expect(toExternalEvent({ id: 'c', summary: 'Standup', start: { dateTime: '2026-10-26T09:00:00-04:00' }, end: { dateTime: '2026-10-26T09:30:00-04:00' } }, TZ)).toMatchObject({ start: Date.UTC(2026, 9, 26, 13), end: Date.UTC(2026, 9, 26, 13, 30) });
  });
});

describe('icsHttp', () => {
  test('webcal becomes https; plain http and junk are refused (a schedule link is a credential)', () => {
    expect(icsFetchUrl('webcal://calendar.example-school.org/feed.ics?token=abc')).toBe('https://calendar.example-school.org/feed.ics?token=abc');
    expect(icsFetchUrl('http://calendar.example-school.org/feed.ics')).toBeNull();
    expect(icsFetchUrl('javascript:alert(1)')).toBeNull();
    expect(icsFetchUrl('not a url')).toBeNull();
  });

  test('conditional GET with the stored validators; 304 → notModified; too big → error; the URL is never in detail', async () => {
    mockFetch(() => ({ status: 304 }));
    expect(await icsHttpFetcher.fetch({ url: 'https://cal.example.org/a.ics?token=s3cret', etag: '"v1"', lastModified: 'Tue, 27 Oct 2026 10:00:00 GMT', maxBytes: ICS.maxBytes, timeoutMs: 1000 })).toEqual({ ok: true, notModified: true });
    expect(calls[0].init?.headers).toMatchObject({ 'If-None-Match': '"v1"', 'If-Modified-Since': 'Tue, 27 Oct 2026 10:00:00 GMT' });

    mockFetch(() => ({ text: 'BEGIN:VCALENDAR\r\n' + 'X'.repeat(200), headers: { etag: '"v2"' } }));
    const big = await icsHttpFetcher.fetch({ url: 'https://cal.example.org/a.ics?token=s3cret', maxBytes: 50, timeoutMs: 1000 });
    expect(big).toMatchObject({ ok: false, failure: 'error' });
    expect(JSON.stringify(big)).not.toContain('s3cret');

    mockFetch(() => ({ text: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR', headers: { etag: '"v2"' } }));
    expect(await icsHttpFetcher.fetch({ url: 'https://cal.example.org/a.ics', maxBytes: 1000, timeoutMs: 1000 })).toEqual({ ok: true, notModified: false, text: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR', etag: '"v2"', lastModified: undefined });
  });
});
