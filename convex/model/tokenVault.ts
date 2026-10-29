// G5 token vault: Google refresh/access tokens are encrypted at rest (AES-GCM, Web Crypto — Convex's default
// runtime, no Node import) under `INTEGRATION_TOKEN_KEY` (32 random bytes, base64url; scripts/secrets.mjs gen).
// Ciphertext format: `v1.<iv>.<ciphertext>` (base64url). The key and the plaintext tokens exist only inside an
// action's memory; `integrationSecrets` holds ciphertext, and no query, view model, log line or error message
// carries either (docs/gates/G5.md invariant 1).
import { GOOGLE } from '../../shared/config/google';
import { getGoogleOAuth } from '../adapters/registry';

const VERSION = 'v1';

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function rawKey(): Uint8Array<ArrayBuffer> | null {
  const value = process.env[GOOGLE.env.tokenKey];
  if (!value) return null;
  const bytes = fromB64Url(value.trim());
  return bytes && bytes.length === 32 ? bytes : null;
}

/** True when a usable 32-byte key is set. Without it Google integrations are `not_configured`. */
export function tokenKeyPresent(): boolean {
  return rawKey() !== null;
}

/** What `integrations.offer` reports as `available.google`: the OAuth client and the vault are both ready. */
export function googleAvailable(): boolean {
  return getGoogleOAuth().configured() && tokenKeyPresent();
}

async function cryptoKey(): Promise<CryptoKey> {
  const raw = rawKey();
  if (!raw) throw new Error('integration token key missing');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plain: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), new TextEncoder().encode(plain));
  return `${VERSION}.${toB64Url(iv)}.${toB64Url(new Uint8Array(ct))}`;
}

/** The plaintext, or null when the ciphertext is malformed or was made under another key (tamper, rotation). */
export async function decryptToken(sealed: string): Promise<string | null> {
  const [version, ivPart, ctPart] = sealed.split('.');
  if (version !== VERSION || !ivPart || !ctPart) return null;
  const iv = fromB64Url(ivPart);
  const ct = fromB64Url(ctPart);
  if (!iv || !ct) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await cryptoKey(), ct);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
