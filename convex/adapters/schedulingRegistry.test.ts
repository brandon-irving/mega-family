import { afterEach, expect, test, vi } from 'vitest';
import { __setMailSchedulingForTests, getMailScheduling } from './registry';

afterEach(() => { __setMailSchedulingForTests(null); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
test('default scheduling is fail-closed and performs no pretend calendar write', async () => {
  vi.stubEnv('MEGA_MODEL_ADAPTER', 'fake');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const adapter = getMailScheduling();
  expect(await adapter.hold({ accessToken: 'test', id: 'event', planKey: 'plan', title: 'Meeting', slot: { start: 1, end: 2 }, confirmed: true })).toEqual({ ok: false, uncertain: false });
  expect(await adapter.watch({ accessToken: 'test', topic: 'test' })).toBeNull();
  const reply = { accessToken: 'test', threadId: 't', to: 'a@example.test', subject: 'Meeting', body: 'Yes', messageId: 'm' };
  expect(await adapter.draft(reply)).toEqual({ ok: false, uncertain: false });
  expect(await adapter.send(reply)).toEqual({ ok: false, uncertain: false });
  expect(fetcher).not.toHaveBeenCalled();
});
