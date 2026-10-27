/// <reference types="vite/client" />
// G3 correctness review C5 (MEDIUM): `respondToRequest` (convex/model/requestEffects.ts) used to fire
// `dispatchTool` for a request's `onAccept` effect and ignore whether it actually succeeded — a failure
// (a malformed listName/text) silently told the accepting member "you'll handle it" while nothing was
// actually added anywhere. It must check `ok`, say so in the reply, and record the failure.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { respondToRequest } from './model/requestEffects';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

async function seededWithOpenRequest() {
  const t = convexTest(schema, modules);
  __setChatModelForTests(makeFakeChatModel(() => jsonReply({ operations: [] })));
  const { familyId, members: rawMembers } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const members = rawMembers as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>>;
  const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner)).unique()))!;
  const mega = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner)).unique()))!;
  await t.mutation(internal.agent.tools.execute, {
    familyId,
    memberId: members.partner,
    megaId: mega._id,
    threadId: thread._id,
    name: 'ask_member',
    argumentsJson: JSON.stringify({ toMemberId: members.admin, text: 'Can you grab oat milk?', onAccept: { tool: 'lists_add', listName: 'Groceries', text: 'Oat milk' } }),
  });
  const request = (await t.run((ctx) => ctx.db.query('requests').withIndex('by_family_to', (q) => q.eq('familyId', familyId).eq('toMemberId', members.admin)).collect()))[0];
  return { t, familyId, members, request };
}

describe('C5: a failed onAccept tool effect is reflected in the reply and recorded, never silent', () => {
  test('a malformed onAccept.text makes dispatchTool fail — the reply says so, and the failure is logged', async () => {
    const { t, familyId, request } = await seededWithOpenRequest();
    // Simulate `dispatchTool` refusing the effect (e.g. a future stricter validator, or corrupted data) —
    // patched directly so this test exercises the FAILURE path without depending on finding a real input
    // `lists_add` happens to reject today.
    await t.run((ctx) => ctx.db.patch(request._id, { onAccept: { tool: 'lists_add', listName: 'Groceries', text: '   ' } }));

    const admin = t.withIdentity({ subject: 'sample:admin' });
    const result = await admin.mutation(api.requests.respond, { requestId: request._id, accept: true });
    expect(result).toBeNull(); // the mutation itself still returns null (CONTRACT shape unchanged)

    // respondToRequest's return value isn't surfaced by requests.respond — assert through the lower-level
    // model function directly for the reply text itself.
    const replyViaCore = await t.run(async (ctx) => {
      const now = Date.now();
      // request is already 'accepted' from the call above; re-open it to exercise the reply text in isolation.
      await ctx.db.patch(request._id, { status: 'open' });
      return respondToRequest(ctx, { requestId: request._id, accept: true, now });
    });
    expect(replyViaCore).toMatch(/couldn't do it automatically/i);

    const list = (await t.run((ctx) => ctx.db.query('lists').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect())).find((l) => l.name === 'Groceries')!;
    const items = await t.run((ctx) => ctx.db.query('listItems').withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', list._id)).collect());
    expect(items.some((i) => i.text.trim() === '')).toBe(false); // nothing bogus got added

    const failureLog = (await t.run((ctx) => ctx.db.query('familyEvents').withIndex('by_family_at', (q) => q.eq('familyId', familyId)).collect())).find(
      (r) => (r.payload as any)?.requestOnAcceptFailed?.requestId === request._id,
    );
    expect(failureLog).toBeDefined(); // the failure is recorded, not silently dropped
  });

  test('control: a well-formed onAccept still succeeds and reports success normally', async () => {
    const { t, request } = await seededWithOpenRequest();
    const admin = t.withIdentity({ subject: 'sample:admin' });
    await admin.mutation(api.requests.respond, { requestId: request._id, accept: true });
    const updated = await t.run((ctx) => ctx.db.get(request._id));
    expect(updated!.status).toBe('accepted');
  });
});
