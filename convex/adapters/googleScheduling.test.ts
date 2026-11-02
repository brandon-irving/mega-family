import { afterEach, expect, test, vi } from 'vitest';
import { googleScheduling } from './googleScheduling';
afterEach(() => vi.unstubAllGlobals());
const reply = { accessToken: 'test', threadId: 'thread', to: 'organizer@example.org', subject: 'Call', body: 'Tuesday at 2 PM works. Please confirm.', replyToMessageId: '<original@example.org>', messageId: 'reply@mega.local' };
test('send preserves threading and only the approved recipient and body', async () => {
 const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'sent' }), { status: 200 })); vi.stubGlobal('fetch', fetcher);
 expect(await googleScheduling.send(reply)).toEqual({ ok: true, id: 'sent' });
 const [url, init] = fetcher.mock.calls[0]; expect(url).toMatch(/messages\/send$/);
 const payload = JSON.parse(init.body); expect(payload.threadId).toBe('thread');
 const raw = Buffer.from(payload.raw, 'base64url').toString();
 expect(raw).toContain('To: organizer@example.org'); expect(raw).toContain('In-Reply-To: <original@example.org>');
 expect(raw).not.toMatch(/(?:Cc|Bcc):/); expect(Buffer.from(raw.split('\r\n\r\n')[1], 'base64').toString()).toBe(reply.body);
});
test('successful response without an id remains uncertain and is never retried', async () => {
 const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetcher);
 expect(await googleScheduling.send(reply)).toEqual({ ok: false, uncertain: true }); expect(fetcher).toHaveBeenCalledTimes(1);
});

test('confirmed participation creates an event with a stable id and no unsolicited invitations', async () => {
 const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'stable' }), { status: 201 })); vi.stubGlobal('fetch', fetcher);
 expect(await googleScheduling.hold({ accessToken: 'test', id: 'stable', planKey: 'plan', title: 'Call', slot: { start: 1, end: 60001 }, confirmed: true })).toEqual({ ok: true, id: 'stable' });
 const body = JSON.parse(fetcher.mock.calls[0][1].body);
 expect(body).toMatchObject({ id: 'stable', status: 'confirmed', extendedProperties: { private: { megaPlan: 'plan' } } });
 expect(body.attendees).toBeUndefined();
});
