/// <reference types="vite/client" />
// G4 backend task 7: gift ideas get a real product link from web search, and the search query carries only the
// idea (built from household-shared facts) — never the birthday person's name or anything private. Since G4b the
// catalog (Shopify) is tried first and web search is the fallback, so these tests pin the catalog as not set up.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakeWebSearch } from './adapters/fakeWebSearch';
import { makeFakeProductCatalog } from './adapters/fakeProductCatalog';
import { __setChatModelForTests, __setProductCatalogForTests, __setWebSearchForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => {
  vi.useFakeTimers();
  __setProductCatalogForTests(makeFakeProductCatalog({ search: () => ({ ok: false, failure: 'not_configured' }) }));
});
afterEach(() => {
  vi.useRealTimers();
  __setProductCatalogForTests(null);
  __setChatModelForTests(null);
  __setWebSearchForTests(null);
});

test('with no catalog, each generated idea gets a product link from WebSearch; queries name the idea, not the person', async () => {
  const t = convexTest(schema, modules);
  const { members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  __setChatModelForTests(makeFakeChatModel(() => jsonReply({ ideas: [{ title: 'Dinosaur dig kit', why: 'Loves dinosaurs.', price: '$25', basedOn: [0] }, { title: 'Building set', why: 'Into building sets.', price: '$40', basedOn: [0] }] })));
  const search = makeFakeWebSearch((req) => ({ ok: true, answer: `Try this ${req.query}.`, sources: [{ title: 'Shop', url: `https://shop.example/${encodeURIComponent(req.query)}` }], searched: true, usage: { tokensIn: 1, tokensOut: 1, cachedTokensIn: 0, searches: 1 } }));
  __setWebSearchForTests(search);

  const { giftIdeasId: id } = await as('partner').mutation(api.gifts.generate, { forMemberId: m.twin1 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const set = await as('partner').query(api.gifts.get, { giftIdeasId: id });
  expect(set.ideas.length).toBe(2);
  expect(set.ideas.every((i) => i.url?.startsWith('https://shop.example/'))).toBe(true);
  expect(search.requests.length).toBe(2);
  for (const r of search.requests) {
    expect(r.query).not.toContain('Twin');
    expect(r.approximateLocation).toBeUndefined();
  }
});

test('a failed search leaves the idea without a link instead of failing the set', async () => {
  const t = convexTest(schema, modules);
  const { members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const m = members as unknown as Record<Key, Id<'members'>>;
  __setChatModelForTests(makeFakeChatModel(() => jsonReply({ ideas: [{ title: 'Dinosaur dig kit', why: 'Loves dinosaurs.', price: '$25', basedOn: [0] }] })));
  __setWebSearchForTests(makeFakeWebSearch(() => ({ ok: false, failure: 'error' })));
  const { giftIdeasId: id } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.gifts.generate, { forMemberId: m.twin1 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const set = await t.withIdentity({ subject: 'sample:admin' }).query(api.gifts.get, { giftIdeasId: id });
  expect(set.status).toBe('ready');
  expect(set.ideas[0].url).toBeUndefined();
});

test('G4 review (security LOW): generating again the same day returns the same set — no second round of product searches', async () => {
  const t = convexTest(schema, modules);
  const { members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  __setChatModelForTests(makeFakeChatModel(() => jsonReply({ ideas: [{ title: 'Dinosaur dig kit', why: 'Loves dinosaurs.', price: '$25', basedOn: [0] }] })));
  const search = makeFakeWebSearch();
  __setWebSearchForTests(search);

  const first = await as('partner').mutation(api.gifts.generate, { forMemberId: m.twin1 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const again = await as('admin').mutation(api.gifts.generate, { forMemberId: m.twin1 });
  const third = await as('partner').mutation(api.gifts.generate, { forMemberId: m.twin1 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(again.giftIdeasId).toBe(first.giftIdeasId);
  expect(third.giftIdeasId).toBe(first.giftIdeasId);
  expect(search.requests.length).toBe(1);
});

test('G4 review: a failed set can be generated again the same day', async () => {
  const t = convexTest(schema, modules);
  const { members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const admin = t.withIdentity({ subject: 'sample:admin' });
  __setChatModelForTests(
    makeFakeChatModel(() => {
      throw new Error('model down');
    }),
  );
  __setWebSearchForTests(makeFakeWebSearch());
  const first = await admin.mutation(api.gifts.generate, { forMemberId: m.twin1 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const retry = await admin.mutation(api.gifts.generate, { forMemberId: m.twin1 });
  expect(retry.giftIdeasId).not.toBe(first.giftIdeasId);
});
