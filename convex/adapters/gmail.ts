// The real MailSource adapter (G5): read-only Gmail. Docs re-checked Oct 29 (developers.google.com/workspace/
// gmail/api): `users.history.list` — "Supplying an invalid or out of date startHistoryId typically returns an
// HTTP 404 error code… your application should perform a full sync"; maxResults defaults to 100, max 500; the
// response's `historyId` is the next start. `users.messages.get?format=full` returns headers and the MIME tree
// with base64url bodies. We keep the From display name/address, Subject and a plain-text body cut to
// `maxBodyChars` for the extraction call only; nothing here is stored.
import { GMAIL } from '../../shared/config/google';
import type { MailMessage } from '../../shared/domain/integrationShapes';
import type { MailSource } from '../ports/mailSource';
import { googleGet, withQuery } from './googleHttp';

type Header = { name?: string; value?: string };
type Part = { mimeType?: string; filename?: string; headers?: Header[]; body?: { data?: string; size?: number }; parts?: Part[] };
type RawMessage = { id?: string; threadId?: string; internalDate?: string; payload?: Part };

/** base64url → UTF-8 text (Gmail's body encoding). */
export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
  try {
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/** HTML → readable text: drops style/script, turns block ends into line breaks, strips tags, decodes the common
 * entities. Good enough for an extraction prompt; never rendered anywhere. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** The first text/plain body in the MIME tree, else the first text/html one as text. Attachments are skipped. */
export function bodyText(part: Part | undefined): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: Part | undefined) => {
    if (!p) return;
    if (p.filename) return; // an attachment
    if (p.body?.data && p.mimeType === 'text/plain') plain.push(decodeBase64Url(p.body.data));
    else if (p.body?.data && p.mimeType === 'text/html') html.push(decodeBase64Url(p.body.data));
    for (const child of p.parts ?? []) walk(child);
  };
  walk(part);
  if (plain.length) return plain.join('\n').trim();
  return html.length ? htmlToText(html.join('\n')) : '';
}

/** `"Maple Elementary" <office@x.org>` → { name, address }; a bare address is both. */
export function parseFrom(value: string): { name: string; address: string } {
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), address: m[2].trim().toLowerCase() };
  return { name: value.trim(), address: value.trim().toLowerCase() };
}

function header(headers: Header[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function toMailMessage(raw: RawMessage, maxBodyChars: number): MailMessage | null {
  if (!raw.id) return null;
  const from = parseFrom(header(raw.payload?.headers, 'From'));
  return {
    id: raw.id,
    threadId: raw.threadId ?? raw.id,
    internalDate: Number(raw.internalDate ?? 0),
    fromName: from.name,
    fromAddress: from.address,
    subject: header(raw.payload?.headers, 'Subject'),
    text: bodyText(raw.payload).slice(0, maxBodyChars),
  };
}

export const gmailMailSource: MailSource = {
  async profile({ accessToken }) {
    const r = await googleGet(`${GMAIL.baseUrl}/profile`, accessToken);
    if (!r.ok) return { ok: false, failure: r.failure, detail: r.detail };
    const j = r.json as { emailAddress?: string; historyId?: string };
    if (!j.historyId) return { ok: false, failure: 'error', detail: 'no historyId' };
    return { ok: true, email: j.emailAddress ?? '', historyId: String(j.historyId) };
  },

  async listRecent({ accessToken, newerThanDays, max }) {
    const r = await googleGet(withQuery(`${GMAIL.baseUrl}/messages`, { q: `newer_than:${newerThanDays}d`, labelIds: GMAIL.labelId, maxResults: Math.min(max, 500) }), accessToken);
    if (!r.ok) return { ok: false, failure: r.failure, detail: r.detail };
    const j = r.json as { messages?: { id?: string }[] };
    return { ok: true, messageIds: (j.messages ?? []).map((m) => m.id).filter((id): id is string => !!id) };
  },

  async history({ accessToken, startHistoryId, max }) {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let historyId = startHistoryId;
    do {
      const r = await googleGet(
        withQuery(`${GMAIL.baseUrl}/history`, { startHistoryId, historyTypes: 'messageAdded', labelId: GMAIL.labelId, maxResults: Math.min(GMAIL.historyMaxResults, 500), pageToken }),
        accessToken,
      );
      if (!r.ok) {
        if (r.status === 404) return { ok: true, stale: true };
        return { ok: false, failure: r.failure, detail: r.detail };
      }
      const j = r.json as { history?: { messagesAdded?: { message?: { id?: string; labelIds?: string[] } }[] }[]; historyId?: string; nextPageToken?: string };
      for (const h of j.history ?? []) for (const added of h.messagesAdded ?? []) if (added.message?.id && !ids.includes(added.message.id)) ids.push(added.message.id);
      if (j.historyId) historyId = String(j.historyId);
      pageToken = j.nextPageToken;
    } while (pageToken && ids.length < max);
    return { ok: true, stale: false, messageIds: ids.slice(0, max), historyId };
  },

  async getMessage({ accessToken, id, maxBodyChars }) {
    const r = await googleGet(withQuery(`${GMAIL.baseUrl}/messages/${encodeURIComponent(id)}`, { format: 'full' }), accessToken);
    if (!r.ok) return { ok: false, failure: r.failure, detail: r.detail };
    const message = toMailMessage(r.json as RawMessage, maxBodyChars);
    return message ? { ok: true, message } : { ok: false, failure: 'error', detail: 'no id' };
  },
};
