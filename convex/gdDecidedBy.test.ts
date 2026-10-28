/// <reference types="vite/client" />
// GD invariant 8 (OpenDuet learning, docs/gates/GD.md): rules only tighten, and every privacy decision
// records what decided it. The keyword backstop may escalate the classifier's "ok" to a concern but never
// clear a concern the model flagged; `memories.gate.decidedBy` says which one decided.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { combineWithBackstop } from './model/concernGate';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

describe('GD invariant 8: rules only tighten, decisions record who decided', () => {
  test('the backstop rule escalates "ok" but never clears a model flag', () => {
    expect(combineWithBackstop('ok', 'health', 'm1')).toEqual({ category: 'health', decidedBy: 'rule:keywordBackstop:health' });
    expect(combineWithBackstop('feelings', null, 'm1')).toEqual({ category: 'feelings', decidedBy: 'model:m1' });
    expect(combineWithBackstop('feelings', 'health', 'm1')).toEqual({ category: 'feelings', decidedBy: 'model:m1' }); // the rule can't override the model
    expect(combineWithBackstop('ok', null, 'm1')).toEqual({ category: 'ok', decidedBy: 'model:m1' });
    expect(combineWithBackstop(null, null, 'm1')).toEqual({ category: 'ok', decidedBy: 'rule:noClassifier' });
  });

  test('the classifier reports what decided, and a saved sensitive memory carries it as `gate`', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    const partner = (members as unknown as Record<string, Id<'members'>>).partner;
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ category: 'ok', confidence: 0.9 })));
    const verdict = await t.action(internal.agent.concernClassifier.classify, { familyId, text: 'Partner started a new medication this week.', aboutNames: ['Partner'] });
    expect(verdict.category).toBe('health'); // escalated by the keyword rule…
    expect(verdict.decidedBy).toMatch(/^rule:keywordBackstop:/); // …and it says so

    const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', partner)).unique()))!;
    const msg = await t.run((ctx) => ctx.db.insert('messages', { familyId, threadId: thread._id, at: 0, author: { kind: 'system' }, via: 'text', body: { type: 'text', text: 'x' }, chips: [] }));
    await t.mutation(internal.agent.writer.applyProposals, {
      familyId,
      memberId: partner,
      role: 'adult',
      threadId: thread._id,
      replyMessageId: msg,
      proposals: [{ trigger: 'explicit', kind: 'note', text: 'I get migraines.', suggestedScope: 'personal', confidence: 1, sensitive: false, serverConcern: 'health', serverConcernBy: 'rule:keywordBackstop:health' }],
    });
    const saved = (await t.run((ctx) => ctx.db.query('memories').withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', `${familyId}:personal:${partner}`)).collect())).find((x) => x.text === 'I get migraines.');
    expect(saved?.sensitive).toBe(true);
    expect(saved?.gate).toEqual({ decidedBy: 'rule:keywordBackstop:health', reason: 'health' });
  });
});
