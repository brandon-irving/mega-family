// G5: a usable Google access token for one member, inside an action. Decrypts the stored one while it has more
// than GOOGLE.refreshSkewSeconds left (Google's own expiry, so the REAL clock, not the family's demo clock);
// otherwise refreshes with the stored refresh token and saves the new access token encrypted. `invalid_grant`
// (lapsed after Testing mode's 7 days, or revoked) → every Google integration of the member flips to
// `needs_reconnect` with one reconnect card (docs/gates/G5.md invariant 7). Tokens never leave this function's
// memory except as ciphertext.
import { GOOGLE } from '../../shared/config/google';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { getGoogleOAuth } from '../adapters/registry';
import type { IntegrationResult } from '../ports/integrationResult';
import { clock } from '../ports/clock';
import { decryptToken, encryptToken, googleAvailable } from './tokenVault';

export async function accessTokenFor(ctx: ActionCtx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<IntegrationResult<{ accessToken: string }>> {
  if (!googleAvailable()) return { ok: false, failure: 'not_configured' };
  const secret = await ctx.runQuery(internal.integrations.secretFor, { familyId, memberId });
  if (!secret) return { ok: false, failure: 'not_configured' };
  const now = clock.realNow();
  if (secret.accessToken && secret.accessTokenExpiresAt && secret.accessTokenExpiresAt - GOOGLE.refreshSkewSeconds * 1000 > now) {
    const token = await decryptToken(secret.accessToken);
    if (token) return { ok: true, accessToken: token };
  }
  const refreshToken = await decryptToken(secret.refreshToken);
  if (!refreshToken) {
    // Unreadable under the current key (rotated or tampered): the grant is unusable; ask to reconnect.
    await ctx.runMutation(internal.integrations.markLapsed, { familyId, memberId });
    return { ok: false, failure: 'unauthorized' };
  }
  const r = await getGoogleOAuth().refresh({ refreshToken });
  if (!r.ok) {
    if (r.failure === 'unauthorized') await ctx.runMutation(internal.integrations.markLapsed, { familyId, memberId });
    return { ok: false, failure: r.failure };
  }
  await ctx.runMutation(internal.integrations.saveAccessToken, { secretId: secret._id, accessToken: await encryptToken(r.accessToken), expiresAt: now + r.expiresInSeconds * 1000 });
  return { ok: true, accessToken: r.accessToken };
}
