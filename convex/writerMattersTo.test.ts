/// <reference types="vite/client" />
// G3 security review S1 (BLOCKER): `convex/agent/writer.ts`'s `applyProposals` used to write a
// `familyEvents` "said" row for ANY `mattersToMemberId` the writer model proposed, regardless of whether
// the underlying memory proposal actually passed the memory-save gate or would even be visible to the
// target member. That row is what `convex/model/proactive.ts`'s `scanFamilyEventTriggers` reads to spin up
// a cross-member push — so a personal confession, a concern-flagged guess, or a proposal the policy itself
// dropped could still reach a different member as a notification. These tests call `applyProposals`
// directly (bypassing the writer's own model call) so each case is deterministic.
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, familyId, members: members as unknown as Record<'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler', Id<'members'>> };
}

async function proposerContext(t: TestConvex<typeof schema>, familyId: Id<'families'>, memberId: Id<'members'>) {
  const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId)).unique()))!;
  const mega = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId)).unique()))!;
  let message = (await t.run((ctx) => ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id)).collect()))[0];
  if (!message) {
    const messageId = await t.run((ctx) =>
      ctx.db.insert('messages', { familyId, threadId: thread._id, at: Date.now(), author: { kind: 'mega', id: mega._id }, via: 'text', body: { type: 'text', text: 'ok' }, chips: [] }),
    );
    message = (await t.run((ctx) => ctx.db.get(messageId)))!;
  }
  return { threadId: thread._id, megaId: mega._id, replyMessageId: message._id };
}

async function pendingMattersToTriggers(t: TestConvex<typeof schema>, familyId: Id<'families'>) {
  const rows = await t.run((ctx) => ctx.db.query('familyEvents').withIndex('by_family_at', (q) => q.eq('familyId', familyId)).collect());
  return rows.filter((r) => r.type === 'said' && !!(r.payload as any)?.mattersToMemberId);
}

describe('S1: the mattersTo cross-member trigger only fires for a proposal that actually passed the gate and is visible to the target', () => {
  test('a personal-scope proposal with mattersToMemberId set never produces a trigger', async () => {
    const { t, familyId, members } = await seeded();
    const { threadId, megaId, replyMessageId } = await proposerContext(t, familyId, members.partner);

    await t.mutation(internal.agent.writer.applyProposals, {
      familyId,
      memberId: members.partner,
      role: 'adult',
      megaId,
      threadId,
      replyMessageId,
      proposals: [
        {
          trigger: 'explicit',
          kind: 'note',
          text: 'Personal confession only Partner should ever see.',
          suggestedScope: 'personal',
          confidence: 1,
          sensitive: false,
          serverConcern: 'ok',
          mattersToMemberId: members.admin,
        },
      ],
    });

    expect(await pendingMattersToTriggers(t, familyId)).toHaveLength(0);
  });

  test('a concern-flagged proposal with mattersToMemberId set never produces a trigger', async () => {
    const { t, familyId, members } = await seeded();
    const { threadId, megaId, replyMessageId } = await proposerContext(t, familyId, members.partner);

    await t.mutation(internal.agent.writer.applyProposals, {
      familyId,
      memberId: members.partner,
      role: 'adult',
      megaId,
      threadId,
      replyMessageId,
      proposals: [
        {
          trigger: 'stated', // not self-reported explicitly -> decideLearning drops it outright
          kind: 'note',
          text: 'Partner seems really stressed about something.',
          suggestedScope: 'family',
          confidence: 0.8,
          sensitive: false,
          serverConcern: 'feelings', // the INDEPENDENT classifier flagged this, not the writer's own label
          mattersToMemberId: members.admin,
        },
      ],
    });

    expect(await pendingMattersToTriggers(t, familyId)).toHaveLength(0);
  });

  test('a dropped proposal (never-save: sensitive guess) with mattersToMemberId set never produces a trigger', async () => {
    const { t, familyId, members } = await seeded();
    const { threadId, megaId, replyMessageId } = await proposerContext(t, familyId, members.partner);

    await t.mutation(internal.agent.writer.applyProposals, {
      familyId,
      memberId: members.partner,
      role: 'adult',
      megaId,
      threadId,
      replyMessageId,
      proposals: [
        {
          trigger: 'pattern', // not explicit/correction -> a sensitive guess is dropped, never saved
          kind: 'preference',
          text: 'Partner might be saving up for something secret.',
          suggestedScope: 'family',
          confidence: 0.9,
          sensitive: true,
          serverConcern: 'ok',
          mattersToMemberId: members.admin,
        },
      ],
    });

    expect(await pendingMattersToTriggers(t, familyId)).toHaveLength(0);
  });

  // GD (owner's explicit-share rule, Oct 26): the writer's "matters to <member>" is a GUESS, so it can no
  // longer start a cross-member push at all — not even for a family-scope fact. For a private fact it becomes
  // at most a share suggestion to the fact's OWN owner; nothing reaches the other member.
  test('GD: a family-scope fact with mattersToMemberId no longer produces a cross-member trigger', async () => {
    const { t, familyId, members } = await seeded();
    const { threadId, megaId, replyMessageId } = await proposerContext(t, familyId, members.partner);

    await t.mutation(internal.agent.writer.applyProposals, {
      familyId,
      memberId: members.partner,
      role: 'adult',
      megaId,
      threadId,
      replyMessageId,
      proposals: [{ trigger: 'explicit', kind: 'fact', text: "We're out of milk.", suggestedScope: 'family', confidence: 1, sensitive: false, serverConcern: 'ok', mattersToMemberId: members.admin }],
    });

    expect(await pendingMattersToTriggers(t, familyId)).toHaveLength(0);
    await t.mutation(internal.proactive.tickFamily, { familyId });
    const candidates = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId)).collect());
    expect(candidates.some((c) => c.source?.kind === 'mattersTo')).toBe(false);
  });

  test('GD: a private fact with mattersToMemberId becomes a share suggestion to its owner only, and the memory stays private', async () => {
    const { t, familyId, members } = await seeded();
    const { threadId, megaId, replyMessageId } = await proposerContext(t, familyId, members.partner);

    await t.mutation(internal.agent.writer.applyProposals, {
      familyId,
      memberId: members.partner,
      role: 'adult',
      megaId,
      threadId,
      replyMessageId,
      proposals: [{ trigger: 'explicit', kind: 'note', text: 'Partner has a work trip next Tuesday.', suggestedScope: 'personal', confidence: 1, sensitive: false, serverConcern: 'ok', mattersToMemberId: members.admin }],
    });

    const memory = (await t.run((ctx) => ctx.db.query('memories').withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', `${familyId}:personal:${members.partner}`)).collect())).find(
      (m) => m.text === 'Partner has a work trip next Tuesday.',
    )!;
    expect(memory.scope).toBe('personal');
    const suggestions = await t.run((ctx) => ctx.db.query('shareSuggestions').withIndex('by_family_owner_status', (q) => q.eq('familyId', familyId).eq('ownerId', members.partner).eq('status', 'pending')).collect());
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].item).toEqual({ kind: 'memory', memoryId: memory._id });
    expect(suggestions[0].decidedBy).toMatch(/^model:/);
    // nothing about it reaches the admin
    const adminSuggestions = await t.run((ctx) => ctx.db.query('shareSuggestions').withIndex('by_family_owner_status', (q) => q.eq('familyId', familyId).eq('ownerId', members.admin)).collect());
    expect(adminSuggestions.some((s) => s.item.kind === 'memory' && s.item.memoryId === memory._id)).toBe(false);
    expect(await pendingMattersToTriggers(t, familyId)).toHaveLength(0);
  });
});
