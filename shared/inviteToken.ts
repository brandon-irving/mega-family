import { INVITE_SCAN } from './config/auth';
import { LINKS } from './domain/api';

/** The invite token from what someone pasted or scanned: the join link (`mega://join/<token>`, an https
 * `…/join/<token>`, with or without a trailing slash, query or fragment) or the bare code. One rule for the
 * app's paste box, its QR scanner and the server's preview/redeem, so a QR carrying the full link and a typed
 * code both resolve. */
export function inviteTokenFrom(input: string): string {
  const trimmed = input.trim().replace(/[?#].*$/, '');
  return trimmed.split('/').filter(Boolean).pop() ?? trimmed;
}

/** G8 (CONTRACT v0.18 decision 5): the QR scanner is strict, unlike the paste box. A code is an invite only
 * when it is the app's own join link (`mega://join/<token>`, optionally with a trailing slash) or a bare
 * token matching `INVITE_SCAN.tokenPattern`; anything else (a web link, a Wi-Fi code, another app's link)
 * is `null` and is never opened, followed or sent anywhere. The server's `invites.preview` still checks. */
export function inviteTokenFromScan(data: string): string | null {
  const trimmed = data.trim();
  const prefix = LINKS.join('');
  const candidate = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).replace(/\/$/, '') : trimmed;
  return INVITE_SCAN.tokenPattern.test(candidate) ? candidate : null;
}
