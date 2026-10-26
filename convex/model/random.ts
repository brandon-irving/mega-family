// Random values used for secrets (parent codes, invite tokens). Web Crypto only — no Node `crypto` import,
// so this runs in Convex's default V8 isolate (actions that need Node builtins get `"use node"` instead).

/** `n` random base-10 digits, e.g. a 5-digit parent code. */
export function randomDigits(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10).toString()).join('');
}

/** A random URL-safe token (for invite links), plus its SHA-256 hex digest to store instead of the token. */
export async function randomToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { token, hash: await sha256Hex(token) };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
