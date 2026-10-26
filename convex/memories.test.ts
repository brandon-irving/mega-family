/// <reference types="vite/client" />
// G1 nit (documented limitation, left as-is — not a bug): memories.list's merge path (more than one
// scope key, e.g. an admin's unfiltered `scope: 'personal'` query, which spans every member's personal
// key) runs one bounded `take` per key and merges in memory rather than true cursor pagination — correct
// for a family's small memory set. The cap now lives in LIMITS.memories.mergeSearchCapPerScope
// (shared/config/limits.ts), not a literal in convex/memories.ts; this proves the two stay in sync.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { LIMITS } from '../shared/config';
import { api, internal } from './_generated/api';
import { scopeKey } from './model/scopes';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

describe('memories.list merge path: the documented per-scope-key cap', () => {
  test('caps the merged result at LIMITS.memories.mergeSearchCapPerScope, even when more exist', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const cap = LIMITS.memories.mergeSearchCapPerScope;

    // Push past the cap in one personal scope key — admin's unfiltered `scope: 'personal'` query spans
    // every member's personal key, which is what triggers the multi-key merge path.
    const extra = cap + 5;
    const key = scopeKey(familyId, { scope: 'personal', memberId: members.admin });
    await t.run(async (ctx) => {
      for (let i = 0; i < extra; i++) {
        await ctx.db.insert('memories', {
          familyId,
          scope: 'personal',
          scopeKey: key,
          about: [members.admin],
          kind: 'note',
          text: `filler memory ${i}`,
          source: { kind: 'admin' },
          trigger: 'explicit',
          confidence: 1,
          confirmed: true,
          sensitive: false,
          pinned: false,
          createdAt: Date.now() + i,
          lastUsedAt: Date.now() + i,
        });
      }
    });

    const result = await t.withIdentity({ subject: 'sample:admin' }).query(api.memories.list, { scope: 'personal', paginationOpts: { numItems: 1000, cursor: null } });
    expect(result.page.length).toBe(cap);
    expect(result.isDone).toBe(true);
  });
});
