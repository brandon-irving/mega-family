/// <reference types="vite/client" />
// G3 security review S2 (HIGH): `ask_member` (convex/agent/tools.ts) let an adult target a KID with an
// ask — creating a request card and a push with Yes/No buttons that reach the kid's own thread and lock
// screen, even though kids can't send asks themselves. `requests.respond` is checked independently (the
// authz rules: a check in one function is never assumed to cover a sibling function).
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, familyId, members: members as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>> };
}

describe('S2: a kid can never be the target of ask_member, and can never respond to a request', () => {
  test('ask_member refuses a kid target with a clear, model-relayable error — no request, no notification', async () => {
    const { t, familyId, members } = await seeded();
    const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.admin)).unique()))!;
    const mega = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', members.admin)).unique()))!;

    const result = await t.mutation(internal.agent.tools.execute, {
      familyId,
      memberId: members.admin,
      megaId: mega._id,
      threadId: thread._id,
      name: 'ask_member',
      argumentsJson: JSON.stringify({ toMemberId: members.twin1, text: 'Can you take out the trash?' }),
    });

    expect(result.ok).toBe(false);
    expect(result.resultText).toMatch(/kid/i);

    const requests = await t.run((ctx) => ctx.db.query('requests').withIndex('by_family_to', (q) => q.eq('familyId', familyId).eq('toMemberId', members.twin1)).collect());
    expect(requests).toHaveLength(0);
    const notifications = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.twin1)).collect());
    expect(notifications).toHaveLength(0);
  });

  test("requests.respond refuses a kid responder even for a request that somehow targets them", async () => {
    const { t, familyId, members } = await seeded();
    // Simulate a request that (through some other path, or legacy data) targets a kid directly — the
    // server boundary must refuse the kid's OWN attempt to respond, independent of how the request got there.
    const requestId = await t.run((ctx) =>
      ctx.db.insert('requests', { familyId, fromMemberId: members.admin, toMemberId: members.twin1, text: 'Can you take out the trash?', status: 'open' }),
    );

    const kid = t.withIdentity({ subject: 'sample:twin1' });
    await expect(kid.mutation(api.requests.respond, { requestId, accept: true })).rejects.toThrow();

    const request = await t.run((ctx) => ctx.db.get(requestId));
    expect(request!.status).toBe('open'); // never applied
  });
});
