// The real GoogleOAuth adapter (G5, CONTRACT §8): Google's OAuth 2.0 web-server flow for our read-only
// integrations (Gmail, Google Calendar). Docs re-checked Oct 29 (developers.google.com/identity/protocols/oauth2/
// web-server): consent at GOOGLE.authUrl with access_type=offline, prompt=consent (a refresh token every time),
// include_granted_scopes=true; code → tokens at GOOGLE.tokenUrl (form-encoded); refresh with
// grant_type=refresh_token, where `invalid_grant` means expired or revoked ("Authenticate the user again") —
// in Testing mode that's 7 days after consent (support.google.com/cloud/answer/15549945); revoke at
// GOOGLE.revokeUrl. Never logs a token, a code or a URL carrying one.
import { GOOGLE } from '../../shared/config/google';
import type { GoogleOAuth, GoogleTokens } from '../ports/googleOAuth';
import type { IntegrationResult } from '../ports/integrationResult';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

/** Client id + secret for the token endpoint, and the at-rest encryption key: all three or nothing works. */
export function googleConfigured(): boolean {
  return !!(env(GOOGLE.env.webClientId) && env(GOOGLE.env.clientSecret) && env(GOOGLE.env.tokenKey));
}

type TokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string; error?: string };

/** POSTs a form to Google and returns the JSON body with the status (Google's errors are JSON bodies on 400). */
async function postForm(url: string, form: Record<string, string>): Promise<{ status: number; body: TokenResponse } | { status: 0; body: null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
    let body: TokenResponse = {};
    try {
      body = (await res.json()) as TokenResponse;
    } catch {
      body = {};
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

/** The `email` claim of an id_token we just received from Google's token endpoint over TLS. Google's docs allow
 * skipping signature checks for a token obtained directly from them this way; we only display it. */
export function emailFromIdToken(idToken: string | undefined): string | undefined {
  const payload = idToken?.split('.')[1];
  if (!payload) return undefined;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { email?: unknown };
    return typeof json.email === 'string' ? json.email : undefined;
  } catch {
    return undefined;
  }
}

function failureFor(status: number, body: TokenResponse | null): IntegrationResult<never> {
  if (body?.error === 'invalid_grant') return { ok: false, failure: 'unauthorized', detail: 'invalid_grant' };
  if (status === 429) return { ok: false, failure: 'rate_limited', detail: 'HTTP 429' };
  return { ok: false, failure: 'error', detail: status ? `HTTP ${status}${body?.error ? ` ${body.error}` : ''}` : 'network error' };
}

export const googleOAuth: GoogleOAuth = {
  configured: googleConfigured,

  authUrl({ scopes, state, redirectUri, loginHint }) {
    const params = new URLSearchParams({
      client_id: env(GOOGLE.env.webClientId) ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    if (loginHint) params.set('login_hint', loginHint);
    return `${GOOGLE.authUrl}?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    if (!googleConfigured()) return { ok: false, failure: 'not_configured' };
    const { status, body } = await postForm(GOOGLE.tokenUrl, {
      code,
      client_id: env(GOOGLE.env.webClientId)!,
      client_secret: env(GOOGLE.env.clientSecret)!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (status !== 200 || !body?.access_token) return failureFor(status, body);
    const tokens: GoogleTokens = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresInSeconds: typeof body.expires_in === 'number' ? body.expires_in : 3600,
      scopes: (body.scope ?? '').split(' ').filter(Boolean),
      email: emailFromIdToken(body.id_token),
    };
    return { ok: true, tokens };
  },

  async refresh({ refreshToken }) {
    if (!googleConfigured()) return { ok: false, failure: 'not_configured' };
    const { status, body } = await postForm(GOOGLE.tokenUrl, {
      client_id: env(GOOGLE.env.webClientId)!,
      client_secret: env(GOOGLE.env.clientSecret)!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    if (status !== 200 || !body?.access_token) return failureFor(status, body);
    return { ok: true, accessToken: body.access_token, expiresInSeconds: typeof body.expires_in === 'number' ? body.expires_in : 3600 };
  },

  async revoke({ token }) {
    const { status, body } = await postForm(GOOGLE.revokeUrl, { token });
    // 200 = revoked; 400 invalid_token = already gone (expired/revoked): both mean "nothing left to revoke".
    if (status === 200 || (status === 400 && (body as { error?: string } | null)?.error === 'invalid_token')) return { ok: true };
    return failureFor(status, body);
  },
};
