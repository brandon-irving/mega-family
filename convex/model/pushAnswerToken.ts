// HMAC-signed, notification-scoped "answer tokens" (CONTRACT §5 v0.11). The push payload carries one so
// iOS's background notification-response task — which runs headless, with no signed-in Better Auth
// session — can still call `POST /push/answer` (convex/pushAnswer.ts) and have the button's effect
// actually run, instead of silently doing nothing until the app happens to be reopened (PLAN.md's push
// section flagged exactly this as a day-3 risk).
//
// Fully stateless: `<expiresAtMs>.<hex HMAC-SHA256 signature over "notificationId:recipientId:expiresAtMs">`.
// Nothing is ever written to a row — verification just recomputes the same signature and compares it to
// what came back, so there's nothing to leak beyond what the token itself already reveals (which notification
// and when it expires; never the secret). Web Crypto only (`crypto.subtle`, no import) — runs in Convex's
// default V8 isolate, same discipline as `convex/model/random.ts`.
//
// The secret lives in `PUSH_ANSWER_SECRET` (scripts/secrets.mjs conventions): `node scripts/secrets.mjs gen
// PUSH_ANSWER_SECRET` then `node scripts/secrets.mjs sync-convex`. Never read or printed anywhere else.
import { LIMITS } from '../../shared/config';
import type { Id } from '../_generated/dataModel';

function requireSecret(): string {
  const secret = process.env.PUSH_ANSWER_SECRET;
  if (!secret) throw new Error('PUSH_ANSWER_SECRET is not set on this deployment — run scripts/secrets.mjs gen PUSH_ANSWER_SECRET, then sync-convex');
  return secret;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function signedMessage(notificationId: Id<'notifications'>, recipientId: Id<'members'>, expiresAt: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${notificationId}:${recipientId}:${expiresAt}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `null` for anything that isn't exactly `/^[0-9a-f]+$/` with an even length — never throws on untrusted
 * input (a malformed token from an HTTP body is just "invalid", not a crash). */
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Issued once per notification, at send time (`convex/proactive.ts`'s `loadPushContext`). `now` is the
 * recipient's family's own clock (the Clock port), never `Date.now()`. */
export async function createAnswerToken(notificationId: Id<'notifications'>, recipientId: Id<'members'>, now: number): Promise<string> {
  const expiresAt = now + LIMITS.push.answerTokenTtlDays * 24 * 60 * 60_000;
  const key = await hmacKey(requireSecret());
  const signature = await crypto.subtle.sign('HMAC', key, signedMessage(notificationId, recipientId, expiresAt));
  return `${expiresAt}.${bytesToHex(new Uint8Array(signature))}`;
}

/** Verifies a token is for exactly this `(notificationId, recipientId)` pair and hasn't expired as of
 * `now`. Uses `crypto.subtle.verify` — a native constant-time comparison — rather than any hand-written
 * string/byte comparison, which is the one part of "verify in constant time" that's easy to get subtly
 * wrong by hand (an early-exit loop, a `===` on the decoded signature). */
export async function verifyAnswerToken(token: string, notificationId: Id<'notifications'>, recipientId: Id<'members'>, now: number): Promise<boolean> {
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const signature = hexToBytes(token.slice(dot + 1));
  if (!signature) return false;
  const key = await hmacKey(requireSecret());
  return crypto.subtle.verify('HMAC', key, signature, signedMessage(notificationId, recipientId, expiresAt));
}
