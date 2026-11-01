import { afterEach, expect, test, vi } from 'vitest';
import { gmailMailSource } from './adapters/gmail';
afterEach(() => vi.unstubAllGlobals());
test('moving an existing message into Inbox is synced once; unrelated label changes are ignored', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ historyId: '200', history: [
    { labelsAdded: [{ message: { id: 'recovered' }, labelIds: ['INBOX'] }, { message: { id: 'other' }, labelIds: ['STARRED'] }] },
    { messagesAdded: [{ message: { id: 'recovered', labelIds: ['INBOX'] } }, { message: { id: 'spam', labelIds: ['SPAM'] } }] },
  ] }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  expect(await gmailMailSource.history({ accessToken: 'test', startHistoryId: '100', max: 10 })).toEqual({ ok: true, stale: false, messageIds: ['recovered'], historyId: '200' });
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.searchParams.getAll('historyTypes')).toEqual(['messageAdded', 'labelAdded']);
});
