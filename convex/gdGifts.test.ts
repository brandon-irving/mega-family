/// <reference types="vite/client" />
// GD invariant 7 (docs/gates/GD.md): gift ideas cite only household-shared facts, and are never visible to
// the person they're for or to kids.
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { scopeKey } from './model/scopes';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  return { t, familyId, m, as };
}

describe('GD invariant 7: gift ideas', () => {
  test('adults see the seeded ideas with their shared sources; the birthday kid and the other kid never do', async () => {
    const { m, as } = await seeded();
    const sets = await as('admin').query(api.gifts.upcoming, {});
    expect(sets).toHaveLength(1);
    expect(sets[0].forMemberId).toBe(m.twin1);
    expect(sets[0].basedOn.map((b) => b.label)).toContain('Twin 1 shared: loves dinosaurs');
    expect((await as('partner').query(api.gifts.upcoming, {})).length).toBe(1);
    for (const k of ['twin1', 'twin2'] as const) {
      expect(codeOf(await as(k).query(api.gifts.upcoming, {}).catch((e) => e))).toBe('FORBIDDEN');
      expect(codeOf(await as(k).query(api.gifts.get, { giftIdeasId: sets[0]._id }).catch((e) => e))).toBe('FORBIDDEN');
    }
  });

  test("an adult can't generate (or read) ideas for themselves", async () => {
    const { t, m, as } = await seeded();
    await t.run((ctx) => ctx.db.patch(m.partner, { birthday: '1990-11-01' }));
    expect(codeOf(await as('partner').mutation(api.gifts.generate, { forMemberId: m.partner }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('the model only ever sees household-shared facts — never a private, grant or sensitive memory', async () => {
    const { t, familyId, m, as } = await seeded();
    const add = (scope: 'personal' | 'family', key: string, text: string, sensitive = false) =>
      t.run((ctx) => ctx.db.insert('memories', { familyId, scope, scopeKey: key, about: [m.twin2], kind: 'preference', text, source: { kind: 'message' }, trigger: 'stated', confidence: 1, confirmed: true, sensitive, pinned: false, createdAt: 0, lastUsedAt: 0 }));
    await add('family', scopeKey(familyId, { scope: 'family' }), 'Loves painting.');
    await add('personal', scopeKey(familyId, { scope: 'personal', memberId: m.twin2 }), 'Secretly wants a phone.');
    await add('family', scopeKey(familyId, { scope: 'family' }), 'Has been anxious lately.', true);
    await t.run((ctx) => ctx.db.patch(m.twin2, { birthday: '2015-11-03' }));

    let prompt = '';
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        prompt = req.messages.map((x) => x.content).join('\n');
        const painting = Number(/(\d+)\. Loves painting/.exec(prompt)?.[1] ?? -1);
        return jsonReply({ ideas: [{ title: 'Paint set', why: 'Loves painting.', price: '$20', basedOn: [painting] }, { title: 'Made up', why: 'cites nothing real', price: '', basedOn: [99] }] });
      }),
    );
    const { giftIdeasId } = await as('admin').mutation(api.gifts.generate, { forMemberId: m.twin2 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(prompt).toContain('Loves painting');
    expect(prompt).not.toContain('Secretly wants a phone');
    expect(prompt).not.toContain('anxious');
    const set = await as('admin').query(api.gifts.get, { giftIdeasId });
    expect(set.status).toBe('ready');
    expect(set.ideas.map((i) => i.title)).toEqual(['Paint set']); // the uncited idea was dropped
    expect(set.basedOn.map((b) => b.label)).toEqual(['Twin 2 shared: loves painting']);
    expect(codeOf(await as('twin2').query(api.gifts.get, { giftIdeasId }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('add to list goes to an adults-only "Gift ideas" list, once, that kids never see', async () => {
    const { as } = await seeded();
    const set = (await as('admin').query(api.gifts.upcoming, {}))[0];
    const a = await as('admin').mutation(api.gifts.addToList, { giftIdeasId: set._id, index: 0 });
    const b = await as('partner').mutation(api.gifts.addToList, { giftIdeasId: set._id, index: 0 });
    expect(a).toBe(b);
    expect((await as('admin').query(api.lists.all, {})).find((l) => l.list.name === 'Gift ideas')?.list.scope).toBe('adults');
    expect((await as('twin1').query(api.lists.all, {})).map((l) => l.list.name)).not.toContain('Gift ideas');
    expect(codeOf(await as('admin').mutation(api.gifts.addToList, { giftIdeasId: set._id, index: 7 }).catch((e) => e))).toBe('VALIDATION');
  });
});
