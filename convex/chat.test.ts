/// <reference types="vite/client" />
// G1 fix: `/chat-stream` (convex/chat.ts `streamChat`, an httpAction) had no auth or ownership check at
// all — anyone who learned a `streamId` could read that stream — and convex/http.ts answered its CORS
// preflight with a wildcard `Access-Control-Allow-Origin: *`. Exercised through convex-test's `t.fetch`,
// which runs the real httpAction against a real Request/Response and carries whatever identity
// `t.withIdentity` set, the same way `chat.streamBody` (the query path) is already covered.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

async function seeded() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const r = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, ...r };
}

function postStream(streamId: string) {
  return { method: 'POST' as const, body: JSON.stringify({ streamId }), headers: { 'Content-Type': 'application/json' } };
}

describe('/chat-stream: auth and ownership', () => {
  test('an unauthenticated POST is refused, not streamed', async () => {
    const { t } = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.send, { text: 'hi', via: 'text' });
    const res = await t.fetch('/chat-stream', postStream(streamId));
    expect(res.status).not.toBe(200);
  });

  test("a different family's signed-in member can't read this family's stream", async () => {
    const { t } = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.send, { text: 'hi', via: 'text' });

    const other = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    await t.run((ctx) => ctx.db.patch(other.members.admin, { authId: 'sample:B:admin' })); // seed.sampleFamily always uses `sample:admin`; give family B's admin a distinct id

    const res = await t.withIdentity({ subject: 'sample:B:admin' }).fetch('/chat-stream', postStream(streamId));
    expect(res.status).not.toBe(200);
  });

  test("a sibling (not a parent) can't read another member's stream via the HTTP route either", async () => {
    const { t } = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:twin2' }).mutation(api.chat.send, { text: 'hi', via: 'text' });

    const res = await t.withIdentity({ subject: 'sample:twin1' }).fetch('/chat-stream', postStream(streamId));
    expect(res.status).not.toBe(200);
  });

  test('the owner can read their own stream', async () => {
    const { t } = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.send, { text: 'hi', via: 'text' });

    const res = await t.withIdentity({ subject: 'sample:admin' }).fetch('/chat-stream', postStream(streamId));
    expect(res.status).toBe(200);
  });

  test('a parent with parentsCanReadChat on can read their kid\'s stream', async () => {
    const { t } = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:twin1' }).mutation(api.chat.send, { text: 'hi', via: 'text' });

    const res = await t.withIdentity({ subject: 'sample:admin' }).fetch('/chat-stream', postStream(streamId));
    expect(res.status).toBe(200);
  });
});

describe('/chat-stream: CORS', () => {
  test('a trusted demo-mode origin (http://localhost:8081) gets its own origin echoed back, not a wildcard', async () => {
    process.env.DEMO_MODE = 'true';
    try {
      const { t } = await seeded();
      const { streamId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.send, { text: 'hi', via: 'text' });
      const res = await t
        .withIdentity({ subject: 'sample:admin' })
        .fetch('/chat-stream', { ...postStream(streamId), headers: { ...postStream(streamId).headers, Origin: 'http://localhost:8081' } });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    } finally {
      delete process.env.DEMO_MODE;
    }
  });

  test('an untrusted origin gets no Access-Control-Allow-Origin header at all (never `*`)', async () => {
    const { t } = await seeded();
    const { streamId } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.chat.send, { text: 'hi', via: 'text' });
    const res = await t
      .withIdentity({ subject: 'sample:admin' })
      .fetch('/chat-stream', { ...postStream(streamId), headers: { ...postStream(streamId).headers, Origin: 'https://evil.example' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
