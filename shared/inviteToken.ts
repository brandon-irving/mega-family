/** The invite token from what someone pasted or scanned: the join link (`mega://join/<token>`, an https
 * `…/join/<token>`, with or without a trailing slash, query or fragment) or the bare code. One rule for the
 * app's paste box, its QR scanner and the server's preview/redeem, so a QR carrying the full link and a typed
 * code both resolve. */
export function inviteTokenFrom(input: string): string {
  const trimmed = input.trim().replace(/[?#].*$/, '');
  return trimmed.split('/').filter(Boolean).pop() ?? trimmed;
}
