import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryCycle } from './demo-delivery.mjs';
function fixture() {
  let saved = null, claim = { runId: 'r', stage: 'meeting', attempt: 1, recipient: 'test@example.test' };
  const counts = { sends: 0, finishes: 0, claims: 0 };
  let failFinish = false, failSend = false;
  const deps = {
    journal: 'test', sender: 'sender@example.test',
    readFile: async () => { if (saved === null) throw Object.assign(new Error(), { code: 'ENOENT' }); return saved; },
    writeFile: async (_, value) => { saved = value; }, unlink: async () => { saved = null; },
    composio: async () => { counts.sends++; if (failSend) throw new Error('timeout'); return { successful: true, data: { id: 'sent-id' } }; },
    convex: async (name, args) => {
      if (name.endsWith(':claim')) { counts.claims++; const job = claim; claim = null; return job; }
      counts.finishes++; if (failFinish) throw new Error('offline'); return args;
    },
  };
  return { deps, counts, saved: () => saved, failFinish: value => { failFinish = value; }, failSend: value => { failSend = value; } };
}
test('failed acknowledgement recovers without sending again', async () => {
  const f = fixture(); f.failFinish(true);
  await assert.rejects(deliveryCycle(f.deps));
  assert.equal(JSON.parse(f.saved()).result.messageId, 'sent-id');
  await assert.rejects(deliveryCycle(f.deps));
  assert.equal(f.counts.claims, 1);
  f.failFinish(false); await deliveryCycle(f.deps);
  assert.equal(f.counts.sends, 1); assert.equal(f.saved(), null);
});
test('uncertain provider result is never automatically resent', async () => {
  const f = fixture(); f.failSend(true); f.failFinish(true);
  await assert.rejects(deliveryCycle(f.deps));
  assert.match(JSON.parse(f.saved()).result.error, /no automatic resend/i);
  f.failFinish(false); await deliveryCycle(f.deps);
  assert.equal(f.counts.sends, 1);
});
test('interrupted delivery without a recorded result only acknowledges uncertainty', async () => {
  const f = fixture();
  await f.deps.writeFile('test', JSON.stringify({ runId: 'r', stage: 'meeting', attempt: 1 }));
  f.failFinish(true);
  await assert.rejects(deliveryCycle(f.deps));
  assert.equal(f.counts.sends, 0); assert.equal(f.counts.claims, 0);
});
test('polling failure leaves no journal and can safely recover', async () => {
  const f = fixture(), original = f.deps.convex;
  f.deps.convex = async () => { throw new Error('offline'); };
  await assert.rejects(deliveryCycle(f.deps));
  assert.equal(f.saved(), null);
  f.deps.convex = original; await deliveryCycle(f.deps);
  assert.equal(f.counts.sends, 1);
});
test('journal failure before delivery never sends an email', async () => {
  const f = fixture(); f.deps.writeFile = async () => { throw new Error('disk full'); };
  await assert.rejects(deliveryCycle(f.deps));
  assert.equal(f.counts.sends, 0);
});
test('failure saving the result recovers uncertainty without repeating the send', async () => {
  const f = fixture(), write = f.deps.writeFile;
  let writes = 0;
  f.deps.writeFile = async (...args) => { if (++writes === 2) throw new Error('disk full'); return write(...args); };
  await assert.rejects(deliveryCycle(f.deps));
  assert.equal(JSON.parse(f.saved()).result, undefined);
  await deliveryCycle(f.deps);
  assert.equal(f.counts.sends, 1);
});
