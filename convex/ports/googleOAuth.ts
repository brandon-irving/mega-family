// The GoogleOAuth port (CONTRACT §8, G5 v0.17): Google's OAuth 2.0 token endpoint for our read-only integrations.
//
// Docs (developers.google.com/identity/protocols/oauth2/web-server, Oct 28): consent at
// https://accounts.google.com/o/oauth2/v2/auth (client_id, redirect_uri, response_type=code, scope, state,
// access_type=offline, prompt=consent, include_granted_scopes=true); code → tokens with
// POST https://oauth2.googleapis.com/token (form: code, client_id, client_secret, redirect_uri,
// grant_type=authorization_code) → { access_token, expires_in, refresh_token (first consent / prompt=consent),
// scope (space-separated, what was actually granted), id_token }; refresh with grant_type=refresh_token;
// `invalid_grant` = expired/revoked (Testing mode: 7 days) → re-consent. Revoke: POST
// https://oauth2.googleapis.com/revoke?token=… . iOS: the native SDK's `serverAuthCode` is exchanged the same way
// with the WEB client's id/secret and an empty redirect_uri.
import type { IntegrationResult } from './integrationResult';

export type GoogleTokens = {
  accessToken: string;
  /** Absent when Google didn't issue one (re-consent without prompt=consent): the caller treats that as a failure. */
  refreshToken?: string;
  expiresInSeconds: number;
  scopes: string[];
  /** From the id_token (openid email scope), shown as "Connected as …". */
  email?: string;
};

export interface GoogleOAuth {
  /** True when the client id/secret and the token key are configured; false → every integration is `not_configured`. */
  configured(): boolean;
  /** The consent URL for the web redirect flow (the adapter fills client_id and the fixed params). */
  authUrl(request: { scopes: string[]; state: string; redirectUri: string; loginHint?: string }): string;
  exchangeCode(request: { code: string; redirectUri: string }): Promise<IntegrationResult<{ tokens: GoogleTokens }>>;
  /** `unauthorized` on invalid_grant (lapsed or revoked). */
  refresh(request: { refreshToken: string }): Promise<IntegrationResult<{ accessToken: string; expiresInSeconds: number }>>;
  revoke(request: { token: string }): Promise<IntegrationResult<object>>;
}
