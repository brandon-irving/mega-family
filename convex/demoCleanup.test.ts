import { afterEach, expect, test, vi } from 'vitest';
import { clearDemoGoogle, isDemoSubject } from './adapters/demoCleanup';
import { DEMO_SCENARIO } from '../shared/config/demo';
afterEach(() => vi.unstubAllGlobals());
test('only anchored MEGA_TEST subjects qualify, including replies', () => {
  expect(isDemoSubject('MEGA_TEST hello')).toBe(true);
  expect(isDemoSubject('Re: MEGA_TEST hello')).toBe(true);
  expect(isDemoSubject('Personal MEGA_TEST note')).toBe(false);
  expect(isDemoSubject('MEGA_TESTING')).toBe(false);
});
test('cleans individual matching emails across pages and matching events, preserving unrelated results', async () => {
  const writes: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, options: RequestInit) => {
    const url = new URL(raw);
    if (options.method !== 'GET') { writes.push(raw); return new Response('{}', { status: 200 }); }
    let data: unknown = {};
    if (url.pathname.endsWith('/profile')) data = { emailAddress: DEMO_SCENARIO.personas[0].email };
    else if (url.pathname.endsWith('/messages')) data = url.searchParams.has('pageToken') ? { messages: [{ id: 'second' }] } : { messages: [{ id: 'first' }, { id: 'unrelated' }], nextPageToken: 'next' };
    else if (url.pathname.includes('/messages/')) data = { payload: { headers: [{ name: 'Subject', value: url.pathname.endsWith('/unrelated') ? 'Personal MEGA_TEST note' : 'MEGA_TEST scenario' }] } };
    else if (url.pathname.endsWith('/events')) data = { items: [{ id: 'demo', summary: 'MEGA_TEST lunch' }, { id: 'private', summary: 'Lunch' }] };
    return new Response(JSON.stringify(data), { status: 200 });
  }));
  expect(await clearDemoGoogle('fake', DEMO_SCENARIO.personas[0].email, [])).toEqual({ mailCount: 2, eventCount: 1, error: null });
  expect(writes).toHaveLength(3);
  expect(writes.join(' ')).not.toMatch(/unrelated|private|threads/);
});
test('identity mismatch never writes', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ emailAddress: 'personal@gmail.com' }), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(clearDemoGoogle('fake', DEMO_SCENARIO.personas[0].email, [])).rejects.toThrow('identity');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
