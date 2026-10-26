/// <reference types="vite/client" />
// Milestone G1. `demo.signInAs` replaces the old `/demo-signin` HTTP route with a contract function
// (CONTRACT.md §4 "Demo", v0.4 pending approval): DEMO_MODE gates it, it requires an authenticated
// identity (an anonymous Better Auth session is fine — the same identity `signInAnonymously` in
// src/services/auth.ts produces), and it links/relinks the chosen sample member's `authId`.
import { ConvexError } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

async function seeded() {
  const t = convexTest(schema, modules);
  const r = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, ...r };
}

function code(err: unknown): string | undefined {
  const data = (err as ConvexError<{ code?: string }> | undefined)?.data ?? (err as { data?: { code?: string } } | undefined)?.data;
  return data?.code;
}

describe('demo.signInAs', () => {
  afterEach(() => {
    delete process.env.DEMO_MODE;
  });

  test('is FORBIDDEN with DEMO_MODE unset', async () => {
    const { t } = await seeded();
    delete process.env.DEMO_MODE;
    const err = await t
      .withIdentity({ subject: 'anon-device-1' })
      .mutation(api.demo.signInAs, { as: 'admin' })
      .catch((e) => e);
    expect(code(err)).toBe('FORBIDDEN');
  });

  test('still requires a signed-in identity once DEMO_MODE=true', async () => {
    const { t } = await seeded();
    process.env.DEMO_MODE = 'true';
    const err = await t.mutation(api.demo.signInAs, { as: 'admin' }).catch((e) => e);
    expect(code(err)).toBe('UNAUTHENTICATED');
  });

  test('once DEMO_MODE=true, links the chosen member and me.get resolves to them', async () => {
    const { t } = await seeded();
    process.env.DEMO_MODE = 'true';
    const anon = t.withIdentity({ subject: 'anon-device-2' });

    await anon.mutation(api.demo.signInAs, { as: 'partner' });

    const viewer = await anon.query(api.me.get, {});
    expect(viewer?.member.name).toBe('Partner');
    expect(viewer?.member.role).toBe('adult');
  });

  test('an anonymous identity works just as well as a pre-seeded one (no credentials needed)', async () => {
    const { t } = await seeded();
    process.env.DEMO_MODE = 'true';
    const anon = t.withIdentity({ subject: 'anon-device-3' });

    await anon.mutation(api.demo.signInAs, { as: 'twin1' });

    const viewer = await anon.query(api.me.get, {});
    expect(viewer?.member.name).toBe('Twin 1');
    expect(viewer?.member.role).toBe('kid');
  });

  test('switching members unlinks the previous one', async () => {
    const { t, members } = await seeded();
    process.env.DEMO_MODE = 'true';
    const anon = t.withIdentity({ subject: 'anon-device-4' });

    await anon.mutation(api.demo.signInAs, { as: 'admin' });
    const adminAfterFirst = await t.run((ctx) => ctx.db.get(members.admin));
    expect(adminAfterFirst?.authId).toBe('anon-device-4');

    await anon.mutation(api.demo.signInAs, { as: 'twin2' });

    const adminAfterSwitch = await t.run((ctx) => ctx.db.get(members.admin));
    expect(adminAfterSwitch?.authId).toBeUndefined();
    const twin2 = await t.run((ctx) => ctx.db.get(members.twin2));
    expect(twin2?.authId).toBe('anon-device-4');

    const viewer = await anon.query(api.me.get, {});
    expect(viewer?.member.name).toBe('Twin 2');

    // the member demo signed OUT of now has no authId at all — not even its seed-time "sample:admin"
    const adminByOldAuthId = await t.withIdentity({ subject: 'sample:admin' }).query(api.me.get, {});
    expect(adminByOldAuthId).toBeNull();
  });
});
