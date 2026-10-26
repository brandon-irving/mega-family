/// <reference types="vite/client" />
// G2 security review BLOCKER, full-pipeline repros: the conversation model's own labels (trigger,
// concernCategory, even a direct "yes it's fine" from the classifier itself) must never be the only thing
// standing between a concerning fact and getting saved. Both repros below script every model call —
// including the independent concern classifier — to claim "this is ordinary" (the worst case: a hijacked
// or simply wrong model all the way down), and the keyword backstop (shared/config/learning.ts) is what
// actually has to catch them.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { __setChatModelForTests } from './adapters/registry';
import { jsonReply, makeFakeChatModel, textReply, toolCallReply } from './adapters/fakeChatModel';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

async function seeded() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, familyId, members };
}

async function familyEventPayloads(t: Awaited<ReturnType<typeof seeded>>['t'], familyId: string) {
  const rows = await t.run((ctx) => ctx.db.query('familyEvents').withIndex('by_family_at', (q) => q.eq('familyId', familyId as any)).collect());
  return rows.map((r) => r.payload);
}

describe('remember tool: a third party reporting a concern about a kid is never saved, even if every model call says it\'s fine', () => {
  test('"Twin 1 is probably being bullied at school" (admin → remember tool) is dropped, not saved to family scope', async () => {
    const { t, familyId, members } = await seeded();
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema?.name === 'concernClassifier') return jsonReply({ category: 'ok', confidence: 0.95 }); // the classifier itself is wrong/hijacked
        if (req.schema?.name === 'learnings') return jsonReply({ operations: [] });
        if (req.messages.some((m) => m.role === 'tool')) return textReply("Noted, thanks.");
        return toolCallReply([
          { id: 'c1', name: 'remember', arguments: { text: 'Twin 1 is probably being bullied at school', kind: 'note', scope: 'family', about: [members.twin1] } },
        ]);
      }),
    );

    const asAdmin = t.withIdentity({ subject: 'sample:admin' });
    await asAdmin.mutation(api.chat.send, { text: 'I noticed something about Twin 1', via: 'text' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const memories = await t.run((ctx) => ctx.db.query('memories').withIndex('by_family_kind', (q) => q.eq('familyId', familyId).eq('kind', 'note')).collect());
    expect(memories.some((m) => m.text.toLowerCase().includes('bullied'))).toBe(false);

    const payloads = await familyEventPayloads(t, familyId);
    expect(payloads.some((p: any) => p?.droppedConcerningMemory?.text?.toLowerCase().includes('bullied'))).toBe(true);
  });
});

describe('memory writer: an inferred health concern on an unrelated turn is never saved, even if the writer itself mislabels it', () => {
  test('"Twin 2 has been having panic attacks lately" (writer proposal, unrelated conversation) is dropped', async () => {
    const { t, familyId, members } = await seeded();
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema?.name === 'concernClassifier') return jsonReply({ category: 'ok', confidence: 0.9 }); // classifier also wrong
        if (req.schema?.name === 'learnings') {
          return jsonReply({
            operations: [
              {
                trigger: 'stated', // the writer itself doesn't even claim this was explicitly said
                kind: 'note',
                text: 'Twin 2 has been having panic attacks lately',
                suggestedScope: 'family',
                about: [members.twin2],
                confidence: 0.8,
                sensitive: false,
                concernCategory: 'none', // the writer mislabels it as not a concern at all
              },
            ],
          });
        }
        return textReply("Sounds good — anything else?"); // the actual conversation is unrelated to Twin 2
      }),
    );

    const asAdmin = t.withIdentity({ subject: 'sample:admin' });
    await asAdmin.mutation(api.chat.send, { text: "What's the weather like today?", via: 'text' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const memories = await t.run((ctx) => ctx.db.query('memories').withIndex('by_family_kind', (q) => q.eq('familyId', familyId).eq('kind', 'note')).collect());
    expect(memories.some((m) => m.text.toLowerCase().includes('panic'))).toBe(false);
    void members;
  });
});

describe('legit logistics still save normally through the same gate', () => {
  test('"Twins have soccer Monday at 6" (writer proposal) is saved to family scope', async () => {
    const { t, familyId, members } = await seeded();
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema?.name === 'concernClassifier') return jsonReply({ category: 'ok', confidence: 0.98 });
        if (req.schema?.name === 'learnings') {
          return jsonReply({
            operations: [
              {
                trigger: 'stated',
                kind: 'routine',
                text: 'Twins have soccer Monday at 6',
                suggestedScope: 'family',
                about: [members.twin1, members.twin2],
                confidence: 0.9,
                sensitive: false,
                concernCategory: 'none',
              },
            ],
          });
        }
        return textReply('Got it!');
      }),
    );

    const asAdmin = t.withIdentity({ subject: 'sample:admin' });
    await asAdmin.mutation(api.chat.send, { text: 'just a heads up, soccer moved to Monday at 6', via: 'text' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const memories = await t.run((ctx) => ctx.db.query('memories').withIndex('by_family_kind', (q) => q.eq('familyId', familyId).eq('kind', 'routine')).collect());
    expect(memories.some((m) => m.text === 'Twins have soccer Monday at 6' && m.scope === 'family')).toBe(true);
  });
});
