import { GMAIL, GOOGLE_CALENDAR, GOOGLE } from '../../shared/config/google';
import type { MailScheduling, WriteResult } from '../ports/mailScheduling';

async function request(url: string, token: string, method: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE.timeoutMs);
  try {
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch { return { status: 0, data: {} }; }
  finally { clearTimeout(timer); }
}
const failed = (status: number): WriteResult => ({ ok: false, uncertain: status === 0 || status >= 500 });
function base64(s: string) { return btoa(Array.from(new TextEncoder().encode(s), b => String.fromCharCode(b)).join('')); }
const header = (s: string) => s.replace(/[\r\n]/g, ' ').trim();
export const googleScheduling: MailScheduling = {
  async watch({ accessToken, topic }) {
    const r = await request(`${GMAIL.baseUrl}/watch`, accessToken, 'POST', { topicName: topic, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' });
    const expiresAt = Number(r.data.expiration);
    return r.status === 200 && Number.isFinite(expiresAt) ? { expiresAt } : null;
  },
  async hold({ accessToken, id, planKey, title, slot, confirmed, cancelled }) {
    const base = `${GOOGLE_CALENDAR.baseUrl}/calendars/primary/events`;
    const body = { id, summary: title, start: { dateTime: new Date(slot.start).toISOString() }, end: { dateTime: new Date(slot.end).toISOString() },
      status: cancelled ? 'cancelled' : confirmed ? 'confirmed' : 'tentative', visibility: 'private', transparency: 'opaque', extendedProperties: { private: { megaPlan: planKey } } };
    // Stable provider id makes create retries safe. No attendees: this never sends an invitation.
    const r = confirmed || cancelled ? { status: 409 } : await request(`${base}?sendUpdates=none`, accessToken, 'POST', body);
    if (r.status === 200 || r.status === 201) return { ok: true, id };
    if (r.status !== 409) return failed(r.status);
    const existing = await request(`${base}/${id}`, accessToken, 'GET');
    if (cancelled && (existing.status === 404 || existing.status === 410)) return { ok: true, id };
    if ((existing.data.extendedProperties as { private?: { megaPlan?: string } })?.private?.megaPlan !== planKey) return failed(existing.status);
    const updated = await request(`${base}/${id}?sendUpdates=none`, accessToken, 'PATCH', { summary: body.summary, start: body.start, end: body.end, status: body.status });
    return updated.status === 200 ? { ok: true, id } : failed(updated.status);
  },
  async draft({ accessToken, threadId, to, subject, body, replyToMessageId, messageId }) {
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to)) return { ok: false, uncertain: false };
    const raw = [`To: ${header(to)}`, `Subject: =?UTF-8?B?${base64(/^re:/i.test(subject) ? header(subject) : `Re: ${header(subject)}`)}?=`,
      `Message-ID: <${header(messageId)}>`, ...(replyToMessageId ? [`In-Reply-To: ${header(replyToMessageId)}`, `References: ${header(replyToMessageId)}`] : []),
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64(body)].join('\r\n');
    const r = await request(`${GMAIL.baseUrl}/drafts`, accessToken, 'POST', { message: { threadId, raw: base64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') } });
    return r.status === 200 && typeof r.data.id === 'string' ? { ok: true, id: r.data.id } : failed(r.status);
  },
};

/** Demo-only cleanup by exact recorded ids. Missing resources count as already removed. */
export async function removeDemoGoogleArtifact(token: string, kind: 'calendar' | 'draft', id: string, planId: string) {
  const url = kind === 'calendar' ? `${GOOGLE_CALENDAR.baseUrl}/calendars/primary/events/${encodeURIComponent(id)}` : `${GMAIL.baseUrl}/drafts/${encodeURIComponent(id)}`;
  const existing = await request(url, token, 'GET');
  if ([404, 410].includes(existing.status)) return true;
  if (existing.status !== 200) return false;
  if (kind === 'calendar' && (existing.data.extendedProperties as { private?: { megaPlan?: string } })?.private?.megaPlan !== planId) return false;
  const removed = await request(`${url}${kind === 'calendar' ? '?sendUpdates=none' : ''}`, token, 'DELETE');
  return [200, 204, 404, 410].includes(removed.status);
}
