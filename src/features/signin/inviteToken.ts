import { inviteTokenFrom } from '@shared/inviteToken';

/** The invite token from a pasted link (`mega://join/<token>`, `https://…/join/<token>`) or a bare code. */
export { inviteTokenFrom as extractToken } from '@shared/inviteToken';

/** A bare invite code someone might paste (the server's `invites.preview` is the real check). */
const BARE_CODE = /^[A-Za-z0-9_-]{4,80}$/;

export type PastedInvite = { kind: 'nothing' } | { kind: 'notInvite' } | { kind: 'invite'; text: string };

/** G8 (board LoginInvite, PasteNothing / PasteNotInvite): what a Paste tap found. Lenient like the field
 * (people paste whatever they have), but a link that isn't a join link, or prose, is "not an invite" so the
 * field keeps what the person typed instead of being overwritten with something that can't work. */
export function pastedInvite(clipboard: string): PastedInvite {
  const text = clipboard.trim();
  if (!text) return { kind: 'nothing' };
  if (/\s/.test(text)) return { kind: 'notInvite' };
  const looksLikeLink = text.includes('://') || text.includes('/');
  if (looksLikeLink) {
    const token = inviteTokenFrom(text);
    return /\/join\/[^/?#]+/.test(text) && BARE_CODE.test(token) ? { kind: 'invite', text } : { kind: 'notInvite' };
  }
  return BARE_CODE.test(text) ? { kind: 'invite', text } : { kind: 'notInvite' };
}
