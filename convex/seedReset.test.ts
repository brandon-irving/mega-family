/// <reference types="vite/client" />
// STATUS.md: re-running `seed:sampleFamily` on a deployment that already has a sample family collides
// `authId`s — a second seed creates members with the exact same placeholder `sample:<key>` authId strings
// as the first seed's members, so any `members.by_authId` lookup for one of those strings finds two rows
// and throws on `.unique()`. `resetSampleFamily` (convex/seed.ts) is the fix: it clears any existing
// sample family completely before reseeding, and carries forward whatever REAL authId a member had been
// linked to (via `demo.signInAs`) so a currently-signed-in demo session keeps its persona.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => {
  process.env.DEMO_MODE = 'true';
});
afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe('seeding twice without a reset collides authIds', () => {
  test('two placeholder-authId members with the same string exist after seeding twice, and a by_authId lookup for it throws', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });

    const partners = await t.run((ctx) => ctx.db.query('members').withIndex('by_authId', (q) => q.eq('authId', 'sample:partner')).collect());
    expect(partners).toHaveLength(2); // the collision

    await expect(t.run((ctx) => ctx.db.query('members').withIndex('by_authId', (q) => q.eq('authId', 'sample:partner')).unique())).rejects.toThrow();
  });
});

describe('resetSampleFamily avoids the collision and preserves a signed-in persona', () => {
  test('exactly one sample family exists after a reset, with no duplicate placeholder authIds', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    await t.mutation(internal.seed.resetSampleFamily, { weekOf: WEEK });

    const families = (await t.run((ctx) => ctx.db.query('families').collect())).filter((f) => f.name === 'Sample Family');
    expect(families).toHaveLength(1);

    const partners = await t.run((ctx) => ctx.db.query('members').withIndex('by_authId', (q) => q.eq('authId', 'sample:partner')).collect());
    expect(partners).toHaveLength(1); // no collision — safe to .unique() this
  });

  test("a real auth identity already signed in as a persona stays linked to that persona after a reset", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });

    const realUser = t.withIdentity({ subject: 'google-oauth2|real-user-123' });
    await realUser.mutation(api.demo.signInAs, { as: 'admin' });
    const before = await realUser.query(api.me.get, {});
    expect(before!.member.name).toBe('Admin');

    await t.mutation(internal.seed.resetSampleFamily, { weekOf: WEEK });

    const after = await realUser.query(api.me.get, {});
    expect(after).not.toBeNull(); // still resolves — the real identity is still linked to SOMEONE
    expect(after!.member.name).toBe('Admin'); // and specifically still Admin, carried into the fresh family

    // and the fresh family's data is really there (not just the member link)
    const lists = await realUser.query(api.lists.all, {});
    expect(lists.some((l) => l.list.name === 'Groceries')).toBe(true);
  });

  test('resetSampleFamily refuses to run when DEMO_MODE is off', async () => {
    const t = convexTest(schema, modules);
    delete process.env.DEMO_MODE;
    await expect(t.mutation(internal.seed.resetSampleFamily, { weekOf: WEEK })).rejects.toThrow();
  });
});
